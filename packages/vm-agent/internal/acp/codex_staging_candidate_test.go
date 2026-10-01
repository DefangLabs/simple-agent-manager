package acp

import (
	"context"
	"crypto/sha256"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestCodexC2CandidateSelectionIsExplicit(t *testing.T) {
	stock := getAgentCommandInfo("openai-codex", "api-key")
	if stock.command != "codex-acp" {
		t.Fatalf("stock command = %q", stock.command)
	}
	t.Setenv(codexC2CandidateEnv, "")
	info, err := selectCodexC2Candidate(stock, "openai-codex")
	if err != nil || info.command != stock.command || info.verifyOnly {
		t.Fatalf("unset selector changed stock path: %+v, %v", info, err)
	}
	t.Setenv(codexC2CandidateEnv, "1")
	info, err = selectCodexC2Candidate(stock, "openai-codex")
	if err != nil || !info.verifyOnly || info.installCmd != "" || info.command != codexC2ReleaseRoot+"/current/bin/codex-acp" {
		t.Fatalf("candidate path not selected: %+v, %v", info, err)
	}
	other, err := selectCodexC2Candidate(getAgentCommandInfo("claude-code", "api-key"), "claude-code")
	if err != nil || other.command != "claude-agent-acp" || other.verifyOnly {
		t.Fatalf("candidate altered other provider: %+v, %v", other, err)
	}
	t.Setenv(codexC2CandidateEnv, "unexpected")
	if _, err := selectCodexC2Candidate(stock, "openai-codex"); err == nil {
		t.Fatal("invalid selector accepted")
	}
}

func TestCodexC2CandidateRealBundle(t *testing.T) {
	root := os.Getenv("SAM_CODEX_C2_TEST_RELEASE_ROOT")
	if root == "" {
		t.Skip("set SAM_CODEX_C2_TEST_RELEASE_ROOT to a verified local bundle")
	}
	check := strings.Replace(codexC2CandidateCheck, codexC2ReleaseRoot, root, 1)
	if output, err := exec.Command("sh", "-c", check).CombinedOutput(); err != nil {
		t.Fatalf("real staged release check failed: %v: %s", err, output)
	}
}

func TestCodexC2CandidateCatalogMatchesReviewedFile(t *testing.T) {
	path := filepath.Join("..", "..", "..", "..", "scripts", "diagnostics", "pinned-codex-catalog", codexC2ReleaseIdentity+".sha256")
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(codexC2CandidateCheck, fmt.Sprintf("%x", sha256.Sum256(content))) {
		t.Fatal("compiled staging trust digest differs from reviewed catalog")
	}
}

func TestCodexC2CandidateProcessCleanupTargetsExecChildren(t *testing.T) {
	got := containerProcessKillPatterns(codexC2ReleaseRoot + "/current/bin/codex-acp")
	if len(got) != 2 || !strings.HasSuffix(got[0], "/payload/adapter.js") || !strings.HasSuffix(got[1], "/payload/codex") {
		t.Fatalf("candidate process cleanup targets = %v", got)
	}
	stock := containerProcessKillPatterns("codex-acp")
	if len(stock) != 1 || stock[0] != "codex-acp" {
		t.Fatalf("stock cleanup target changed: %v", stock)
	}
}

func TestCodexC2CandidateMissingReleaseFailsClosed(t *testing.T) {
	// The candidate path is absent in ordinary CI. A verify-only selection must
	// fail without running the stock npm installer or launching an agent.
	if !strings.Contains(codexC2CandidateCheck, "sha256sum --check --status") {
		t.Fatal("candidate no longer verifies full release")
	}
	host := NewSessionHost(SessionHostConfig{GatewayConfig: GatewayConfig{ProcessLauncher: LocalLauncher{}}})
	defer host.Stop()
	if err := host.ensureAgentInstalled(context.Background(), agentCommandInfo{
		command: codexC2ReleaseRoot + "/current/bin/codex-acp", validationCmd: "exit 1", verifyOnly: true,
	}); err == nil {
		t.Fatal("failed candidate verification fell back to stock")
	}
}
