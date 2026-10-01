package acp

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"syscall"
	"testing"
	"time"

	acpsdk "github.com/coder/acp-go-sdk"
)

// This opt-in test uses locally built, exact-pin patched binaries. It never
// contacts a model or Cloudflare; the recorder implements the Worker callback
// contract through the real SessionHost ACP client.
func TestPinnedCodexProcessThroughGoClientAndLocalWorker(t *testing.T) {
	for _, testCase := range []struct {
		name                   string
		completionBeforeAnswer bool
		answer                 string
	}{
		{name: "answer_then_completion", answer: "accepted"},
		{name: "completion_then_answer", completionBeforeAnswer: true, answer: "accepted"},
		{name: "human_denial", answer: "declined"},
		{name: "human_cancel", answer: "cancelled"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			runPinnedCodexProcessCase(t, testCase.completionBeforeAnswer, testCase.answer)
		})
	}
}

func runPinnedCodexProcessCase(t *testing.T, completionBeforeAnswer bool, answer string) {
	adapter := os.Getenv("SAM_PINNED_CODEX_ADAPTER")
	codex := os.Getenv("SAM_PINNED_CODEX_CLI")
	fixtureScript := os.Getenv("SAM_PINNED_MCP_FIXTURE")
	if adapter == "" || codex == "" || fixtureScript == "" {
		t.Skip("set all three SAM_PINNED_* paths for the local pinned-process probe")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	fixture := exec.CommandContext(ctx, "node", fixtureScript)
	fixtureOut, err := fixture.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	fixture.Stderr = io.Discard
	if err := fixture.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = fixture.Process.Kill(); _ = fixture.Wait() }()
	fixtureLines := bufio.NewScanner(fixtureOut)
	if !fixtureLines.Scan() {
		t.Fatal("MCP fixture did not start")
	}
	var fixtureReady struct {
		Port int `json:"port"`
	}
	if err := json.Unmarshal(fixtureLines.Bytes(), &fixtureReady); err != nil || fixtureReady.Port == 0 {
		t.Fatal("MCP fixture did not provide a local port")
	}
	fixtureEvents := make(chan string, 16)
	go func() {
		for fixtureLines.Scan() {
			var event struct {
				Kind string `json:"kind"`
			}
			if json.Unmarshal(fixtureLines.Bytes(), &event) == nil {
				fixtureEvents <- event.Kind
			}
		}
	}()

	var modelCalls atomic.Int32
	model := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		_, _ = io.Copy(io.Discard, io.LimitReader(r.Body, 1<<20))
		call := modelCalls.Add(1)
		item := map[string]any{"type": "message", "role": "assistant", "id": fmt.Sprintf("msg-%d", call),
			"content": []any{map[string]any{"type": "output_text", "text": "Done"}}}
		if call == 1 {
			item = map[string]any{"type": "function_call", "call_id": "safe-call", "namespace": "mcp__fixture",
				"name": "request_remote_url", "arguments": "{}"}
		}
		w.Header().Set("Content-Type", "text/event-stream")
		for _, event := range []map[string]any{
			{"type": "response.created", "response": map[string]any{"id": fmt.Sprintf("response-%d", call)}},
			{"type": "response.output_item.done", "item": item},
			{"type": "response.completed", "response": map[string]any{"id": fmt.Sprintf("response-%d", call),
				"usage": map[string]any{"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}}},
		} {
			data, _ := json.Marshal(event)
			_, _ = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event["type"], data)
		}
	}))
	defer model.Close()
	home := t.TempDir()
	modelURL, _ := url.Parse(model.URL)
	config := fmt.Sprintf("model = \"mock-model\"\napproval_policy = \"never\"\nsandbox_mode = \"danger-full-access\"\nmodel_provider = \"mock_provider\"\n[model_providers.mock_provider]\nname = \"Mock\"\nbase_url = \"%s/v1\"\nwire_api = \"responses\"\nenv_key = \"PROBE_API_KEY\"\nrequest_max_retries = 0\nstream_max_retries = 0\n", modelURL.String())
	if err := os.WriteFile(filepath.Join(home, "config.toml"), []byte(config), 0600); err != nil {
		t.Fatal(err)
	}

	recorder := newInteractionRecorder(t, http.StatusCreated)
	host, _ := newInteractionHost(recorder)
	host.ConfigureAcpInteractions(testURLConfig())
	defer host.Stop()
	cmd := exec.CommandContext(ctx, "node", adapter)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Env = append(os.Environ(), "CODEX_PATH="+codex, "CODEX_HOME="+home,
		"CODEX_API_KEY=probe-only", "PROBE_API_KEY=probe-only", "PROBE_MCP_TOKEN=probe-only")
	cmd.Stderr = io.Discard
	stdin, err := cmd.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		_ = cmd.Wait()
	}()
	client := acpsdk.NewClientSideConnection(&sessionHostClient{host: host, interactionGeneration: host.interactionGeneration}, stdin, stdout)
	_, err = client.Initialize(ctx, acpsdk.InitializeRequest{
		ProtocolVersion: acpsdk.ProtocolVersionNumber,
		ClientCapabilities: acpsdk.ClientCapabilities{Elicitation: &acpsdk.ElicitationCapabilities{
			Form: &acpsdk.ElicitationFormCapabilities{}, Url: &acpsdk.ElicitationUrlCapabilities{},
		}},
	})
	if err != nil {
		t.Fatalf("ACP initialize: %v", err)
	}
	session, err := client.NewSession(ctx, acpsdk.NewSessionRequest{Cwd: home, McpServers: []acpsdk.McpServer{{Http: &acpsdk.McpServerHttpInline{
		Type: "http", Name: "fixture", Url: fmt.Sprintf("http://127.0.0.1:%d/mcp", fixtureReady.Port),
		Headers: []acpsdk.HttpHeader{{Name: "Authorization", Value: "Bearer probe-only"}},
	}}}})
	if err != nil {
		t.Fatalf("ACP new session: %v", err)
	}
	promptDone := make(chan error, 1)
	go func() {
		_, err := client.Prompt(ctx, acpsdk.PromptRequest{SessionId: session.SessionId,
			Prompt: []acpsdk.ContentBlock{acpsdk.TextBlock("Call the local fixture")}})
		promptDone <- err
	}()
	var created acpInteractionCreateRequest
	select {
	case created = <-recorder.creates:
	case err := <-promptDone:
		t.Fatalf("prompt ended before Worker receipt: %v", err)
	case <-ctx.Done():
		t.Fatal("no local Worker receipt")
	}
	if created.Kind != "url" {
		t.Fatalf("interaction kind = %q", created.Kind)
	}
	if status := host.ResolveAcpInteractionAnswer(created.InteractionID, "stale-generation",
		AcpInteractionAnswerDecision{Kind: "accepted", AnswerHash: strings.Repeat("a", 64)}); status != "stale_generation" {
		t.Fatalf("stale answer = %q", status)
	}
	completeFixture := func() {
		state := mustURLState(t, created.Detail.URL)
		form := url.Values{"state": {state}}
		response, err := http.PostForm(fmt.Sprintf("http://127.0.0.1:%d/complete", fixtureReady.Port), form)
		if err != nil {
			t.Fatal(err)
		}
		_ = response.Body.Close()
		if response.StatusCode != http.StatusOK {
			t.Fatalf("fixture completion status = %d", response.StatusCode)
		}
		select {
		case <-recorder.completions:
		case <-ctx.Done():
			var seen []string
			for {
				select {
				case event := <-fixtureEvents:
					seen = append(seen, event)
				default:
					t.Fatalf("completion callback missing; fixture events=%v", seen)
				}
			}
		}
	}
	if completionBeforeAnswer {
		completeFixture()
	}
	hash := sha256.Sum256([]byte(answer))
	decision := AcpInteractionAnswerDecision{Kind: answer, AnswerHash: hex.EncodeToString(hash[:])}
	if status := host.ResolveAcpInteractionAnswer(created.InteractionID, created.Generation, decision); status != "consumed" {
		t.Fatalf("answer = %q", status)
	}
	select {
	case err := <-promptDone:
		if err != nil {
			t.Fatalf("prompt: %v", err)
		}
	case <-ctx.Done():
		t.Fatal("prompt did not complete after answer")
	}
	if answer == "accepted" && !completionBeforeAnswer {
		completeFixture()
	}
	wants := []string{"requested", "accepted", "service_completed", "completion_notified"}
	if answer == "declined" || answer == "cancelled" {
		wants = []string{"requested", answer}
	}
	if completionBeforeAnswer {
		wants = []string{"requested", "service_completed", "completion_notified", "accepted"}
	}
	for _, want := range wants {
		select {
		case got := <-fixtureEvents:
			if got != want {
				t.Fatalf("fixture event = %q, want %q", got, want)
			}
		case <-ctx.Done():
			t.Fatalf("fixture event %q missing", want)
		}
	}
	if status := host.ResolveAcpInteractionAnswer(created.InteractionID, created.Generation, decision); status == "consumed" {
		t.Fatal("replayed answer was consumed")
	}
	if answer == "accepted" {
		state := mustURLState(t, created.Detail.URL)
		replay, err := http.NewRequestWithContext(ctx, http.MethodPost,
			fmt.Sprintf("http://127.0.0.1:%d/admin/replay", fixtureReady.Port),
			strings.NewReader(url.Values{"state": {state}}.Encode()))
		if err != nil {
			t.Fatal(err)
		}
		replay.Header.Set("Authorization", "Bearer probe-only")
		replay.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		response, err := http.DefaultClient.Do(replay)
		if err != nil {
			t.Fatal(err)
		}
		_ = response.Body.Close()
		if response.StatusCode != http.StatusNoContent {
			t.Fatalf("replay status = %d", response.StatusCode)
		}
		select {
		case event := <-fixtureEvents:
			if event != "completion_replayed" {
				t.Fatalf("fixture replay event = %q", event)
			}
		case <-ctx.Done():
			t.Fatal("fixture replay event missing")
		}
		select {
		case <-recorder.completions:
			t.Fatal("replayed completion reached Worker twice")
		case <-time.After(100 * time.Millisecond):
		}
	}
}

func mustURLState(t *testing.T, raw string) string {
	t.Helper()
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Query().Get("state") == "" {
		t.Fatal("fixture URL has no state")
	}
	return parsed.Query().Get("state")
}
