package acp

import (
	"context"
	_ "embed"
	"fmt"
	"net/url"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/workspace/vm-agent/internal/config"
)

//go:embed codex_runtime_installer.sh
var codexRuntimeInstaller string

const codexRuntimeArchiveSHA = "e85e7bfee875bb0bc0397a546073b324258d4cba2c0e54cb3808c3596825b292"
const codexRuntimeArchiveBytes = 132578703

var codexRuntimeHostPattern = regexp.MustCompile(`^[a-zA-Z0-9.-]+$`)

func codexRuntimeInstallScript(controlPlaneURL string, budget, killGrace time.Duration) (string, error) {
	origin, err := url.Parse(controlPlaneURL)
	if err != nil || origin.Host == "" || origin.User != nil || origin.RawQuery != "" || origin.Fragment != "" || (origin.Path != "" && origin.Path != "/") || !codexRuntimeHostPattern.MatchString(origin.Hostname()) {
		return "", fmt.Errorf("invalid runtime artifact origin")
	}
	if origin.Scheme != "https" && !(origin.Scheme == "http" && (origin.Hostname() == "127.0.0.1" || origin.Hostname() == "localhost")) {
		return "", fmt.Errorf("runtime artifact origin requires HTTPS")
	}
	if budget <= 0 {
		budget = config.DefaultCodexRuntimeInstallTimeout
	}
	if killGrace <= 0 {
		killGrace = config.DefaultCodexRuntimeInstallKillGrace
	}
	seconds := strconv.FormatFloat(budget.Seconds(), 'f', -1, 64)
	graceSeconds := strconv.FormatFloat(killGrace.Seconds(), 'f', -1, 64)
	origin.Path = "/api/acp/codex-runtime/download"
	origin.RawQuery = url.Values{"release": {codexRuntimeArchiveSHA}, "os": {"linux"}, "arch": {"amd64"}}.Encode()
	quote := func(value string) string { return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'" }
	script := "set -eu\n[[ -d /tmp && ! -L /tmp && $(stat -c %u /tmp) == 0 ]]\nmode=$(stat -c %a /tmp)\n(( (8#$mode & 0022) == 0 || (8#$mode & 01000) != 0 ))\nwork=$(mktemp -d /tmp/sam-codex-fetch.XXXXXX)\ntrap 'rm -rf -- \"$work\"' EXIT\n"
	script += fmt.Sprintf("curl --fail --silent --show-error --max-time %s --max-filesize %d --output \"$work/runtime.tar.gz\" %s\n", seconds, codexRuntimeArchiveBytes, quote(origin.String()))
	script += "cat >\"$work/install.sh\" <<'SAM_PINNED_CODEX_INSTALLER'\n" + codexRuntimeInstaller + "\nSAM_PINNED_CODEX_INSTALLER\n"
	script += "bash \"$work/install.sh\" \"$work/runtime.tar.gz\" " + quote(codexC2ReleaseRoot) + "\n"
	// Killing docker's client alone does not stop exec processes in the container.
	// This independent deadline also bounds work after the host context is cancelled.
	return "timeout --kill-after=" + graceSeconds + " " + seconds + " bash -c " + quote(script), nil
}

func (h *SessionHost) ensureCodexRuntimeInContainer(ctx context.Context, containerID string, info agentCommandInfo) error {
	budget := h.config.CodexRuntimeInstallTimeout
	if budget <= 0 {
		budget = config.DefaultCodexRuntimeInstallTimeout
	}
	killGrace := h.config.CodexRuntimeInstallKillGrace
	if killGrace <= 0 {
		killGrace = config.DefaultCodexRuntimeInstallKillGrace
	}
	bounded, cancel := context.WithTimeout(ctx, budget)
	defer cancel()
	// Construct each command only when it is about to run. Queueing and prior
	// verification consume the same budget; docker client cancellation alone
	// cannot stop an exec process already started inside the container.
	run := func(root bool, install bool) error {
		if err := bounded.Err(); err != nil {
			return err
		}
		deadline, _ := bounded.Deadline()
		remaining := time.Until(deadline)
		if remaining <= 0 {
			return context.DeadlineExceeded
		}
		script := codexRuntimeBoundedCommand(info.validationCmd, remaining, killGrace)
		if install {
			var err error
			script, err = codexRuntimeInstallScript(h.config.ControlPlaneURL, remaining, killGrace)
			if err != nil {
				return err
			}
		}
		args := []string{"exec"}
		if root {
			args = append(args, "-u", "root")
		}
		args = append(args, containerID, "sh", "-c", script)
		return exec.CommandContext(bounded, "docker", args...).Run()
	}
	if err := run(false, false); err == nil {
		return nil
	}
	// Share the global installation gate with stock agent installers.
	release, err := acquireAgentInstall(bounded)
	if err != nil {
		return err
	}
	defer release()
	if err := run(false, false); err == nil {
		return nil
	}
	if err := run(true, true); err != nil {
		return fmt.Errorf("Codex runtime installation failed: %w", err)
	}
	if err := run(false, false); err != nil {
		return fmt.Errorf("installed Codex runtime verification failed: %w", err)
	}
	return nil
}

func codexRuntimeBoundedCommand(script string, budget, killGrace time.Duration) string {
	seconds := strconv.FormatFloat(budget.Seconds(), 'f', -1, 64)
	grace := strconv.FormatFloat(killGrace.Seconds(), 'f', -1, 64)
	quoted := "'" + strings.ReplaceAll(script, "'", "'\"'\"'") + "'"
	return "timeout --kill-after=" + grace + " " + seconds + " bash -c " + quoted
}
