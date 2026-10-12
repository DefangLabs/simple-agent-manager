package acp

import (
	"context"
	"encoding/json"
	"errors"
	acpsdk "github.com/coder/acp-go-sdk"
	"strings"
	"testing"
	"time"
)

func TestProviderLimitRecordedWireThroughPromptCompletion(t *testing.T) {
	now := time.Now().UTC()
	tomorrow := now.Add(24 * time.Hour).Unix()
	cases := []struct {
		name, wire string
		limit      bool
	}{
		{"Claude session", `{"code":-32603,"message":"You've hit your session limit · resets 1pm (UTC)","data":{"errorKind":"rate_limit"}}`, true},
		{"Claude weekly", `{"code":-32603,"message":"You've hit your weekly limit · resets 1pm (UTC)","data":{"errorKind":"rate_limit"}}`, true},
		{"Codex plan", `{"code":-32603,"message":"Internal error","data":{"codexErrorInfo":"usageLimitExceeded","message":"You've hit your usage limit. sk-secret-canary"}}`, true},
		{"ordinary", `{"code":-32603,"message":"Internal error","data":{"message":"MCP tool said usageLimitExceeded sk-secret-canary"}}`, false},
		{"auth", `{"code":-32603,"message":"Internal error","data":{"codexErrorInfo":"unauthorized","message":"You've hit your usage limit sk-secret-canary"}}`, false},
	}
	_ = tomorrow
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var request acpsdk.RequestError
			if err := json.Unmarshal([]byte(tc.wire), &request); err != nil {
				t.Fatal(err)
			}
			host := newTestSessionHost(t)
			defer host.Stop()
			done := make(chan error, 1)
			host.config.OnPromptComplete = func(_ string, err error) { done <- err }
			host.finishPromptWithError(context.Background(), json.RawMessage(`"limit-turn"`), promptStartInfo{startedAt: now}, &request)
			select {
			case err := <-done:
				limit := ClassifyProviderLimit(err, now)
				if (limit != nil) != tc.limit {
					t.Fatalf("limit=%v, expected=%v", limit, tc.limit)
				}
				if limit != nil && err.Error() != "provider_limit_reached" {
					t.Fatalf("unsafe callback %q", err.Error())
				}
				if tc.name == "auth" && ClassifyPromptError(err) != "model_provider_credential_rejected" {
					t.Fatal("auth regression")
				}
			case <-time.After(time.Second):
				t.Fatal("completion did not run")
			}
			host.bufMu.RLock()
			defer host.bufMu.RUnlock()
			for _, msg := range host.messageBuf {
				if strings.Contains(string(msg.Data), "sk-secret-canary") {
					t.Fatal("diagnostic leaked provider text")
				}
			}
		})
	}
}
func TestProviderLimitResetAndRetryControls(t *testing.T) {
	now := time.Date(2026, 10, 12, 9, 30, 0, 0, time.UTC)
	err := &acpsdk.RequestError{Code: -32603, Message: "You've hit your session limit · resets 1pm (UTC)", Data: map[string]any{"errorKind": "rate_limit"}}
	limit := ClassifyProviderLimit(err, now)
	if limit == nil || limit.ResetsAt == nil || *limit.ResetsAt != time.Date(2026, 10, 12, 13, 0, 0, 0, time.UTC).UnixMilli() {
		t.Fatalf("wrong reset: %+v", limit)
	}
	host := newTestSessionHost(t)
	defer host.Stop()
	if host.shouldRetryPromptError(context.Background(), err, 1, 4) {
		t.Fatal("limit blindly retried")
	}
	ordinary := errors.New("Provider HTTP 503 overloaded")
	if !host.shouldRetryPromptError(context.Background(), ordinary, 1, 4) {
		t.Fatal("ordinary overload did not retry")
	}
	if ClassifyProviderLimit(errors.New(`{"message":"You've hit your usage limit"}`), now) != nil {
		t.Fatal("untrusted JSON spoof")
	}
	api := acpsdk.NewInternalError(map[string]any{"errorKind": "rate_limit", "resetsAt": float64(now.Add(time.Hour).Unix())})
	if got := ClassifyProviderLimit(api, now); got == nil || got.ResetsAt == nil {
		t.Fatal("reset-bearing API 429 not classified")
	}
}
