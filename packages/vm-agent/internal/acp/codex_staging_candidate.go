package acp

import (
	"context"
	"fmt"
)

// The staging fixture profile supplies this through the Cloudflare-authorized
// per-session runtime-assets path. It is never read from the VM-agent host env.
const codexC2CandidateEnv = "SAM_CODEX_C2_CANDIDATE"
const codexC2ReleaseRoot = "/opt/sam-codex-c2"
const codexC2ReleaseIdentity = "sam-codex-acp-1.13.1-sam-c2.1+cli-0.156.1-sam-c2.1-3b2c67ac32ea"

// The catalog is outside the candidate and its digest is compiled into the
// staging VM agent, so a rewritten release-owned manifest cannot authorize a
// modified executable. A failed check never invokes npm or the stock adapter.
const codexC2CandidateCheck = `set -eu; root=/opt/sam-codex-c2; id=sam-codex-acp-1.13.1-sam-c2.1+cli-0.156.1-sam-c2.1-3b2c67ac32ea; release="$root/releases/$id"; catalog="$root/catalog/$id.sha256"; [ "$(uname -m)" = x86_64 ] && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ] && [ "$(readlink -f "$root/current")" = "$release" ] && [ ! -L "$release" ] && [ ! -L "$catalog" ] && [ "$(sha256sum "$catalog" | cut -d ' ' -f 1)" = 5f6f8fe7256a682c2465ab334042c241992418050b8c7cec564bb7877a9e3218 ] && [ -x "$release/bin/codex" ] && [ -x "$release/bin/codex-acp" ] && [ -x "$release/payload/codex" ] && [ -z "$(find "$release" -type l -print -quit)" ] && [ "$(cd "$release" && find . -type f -printf '%P\n' | sort)" = "$(printf '%s\n' bin/codex bin/codex-acp payload/SHA256SUMS payload/SOURCE-PROVENANCE payload/adapter.js payload/codex | sort)" ] && (cd "$release" && sha256sum --check --status "$catalog") && [ "$("$root/current/bin/codex" --version)" = 'codex-cli 0.156.1-sam-c2.1' ] && [ "$("$root/current/bin/codex-acp" --version)" = '@agentclientprotocol/codex-acp 1.13.1-sam-c2.1' ]`

func (h *SessionHost) resolveCodexC2Selector(ctx context.Context, agentType string) (string, error) {
	if agentType != "openai-codex" || h.config.RuntimeAssetsProvider == nil {
		return "", nil
	}
	assets, err := h.config.RuntimeAssetsProvider(ctx)
	if err != nil {
		return "", fmt.Errorf("fetch Codex session runtime assets: %w", err)
	}
	selector := ""
	seen := false
	for _, item := range assets.EnvVars {
		if item.Key == codexC2CandidateEnv {
			if seen {
				return "", fmt.Errorf("duplicate %s selector in session runtime assets", codexC2CandidateEnv)
			}
			if item.Value == "" {
				return "", fmt.Errorf("empty %s selector in session runtime assets", codexC2CandidateEnv)
			}
			seen = true
			selector = item.Value
		}
	}
	return selector, nil
}

func selectCodexC2Candidate(info agentCommandInfo, agentType, selector string) (agentCommandInfo, error) {
	if agentType != "openai-codex" {
		return info, nil
	}
	switch selector {
	case "":
		return info, nil
	case "1":
		info.command = codexC2ReleaseRoot + "/current/bin/codex-acp"
		info.installCmd = ""
		info.isNpmBased = false
		info.validationCmd = codexC2CandidateCheck
		info.verifyOnly = true
		return info, nil
	default:
		return info, fmt.Errorf("invalid %s selector", codexC2CandidateEnv)
	}
}
