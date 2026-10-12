package acp

import (
	"errors"
	"regexp"
	"strconv"
	"strings"
	"time"

	acpsdk "github.com/coder/acp-go-sdk"
)

// ProviderLimitError retains only allowlisted recovery metadata. The provider's
// message is deliberately not retained: callbacks, logs and viewers use Error().
type ProviderLimitError struct{ ResetsAt *int64 }

func (e *ProviderLimitError) Error() string { return "provider_limit_reached" }

var limitClockReset = regexp.MustCompile(`(?i)resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(UTC\)`)

// ClassifyProviderLimit accepts only terminal provider errors, never serialized
// SDK metadata or arbitrary tool output. Pinned Claude ACP uses the synthetic
// limit message as RequestError.Message (not always "Internal error"). Codex
// ACP 2.1.1 carries the app-server's categorical codexErrorInfo in Data.
func ClassifyProviderLimit(err error, now time.Time) *ProviderLimitError {
	if err == nil {
		return nil
	}
	var safe *ProviderLimitError
	if errors.As(err, &safe) {
		return safe
	}
	var request *acpsdk.RequestError
	if errors.As(err, &request) {
		if request.Code != -32603 {
			return nil
		}
		data, _ := request.Data.(map[string]any)
		if data["errorKind"] == "authentication_failed" || data["codexErrorInfo"] == "unauthorized" {
			return nil
		}
		message := request.Message
		if message == "Internal error" {
			message, _ = data["message"].(string)
		}
		plan := isPlanLimitMessage(message)
		codex := data["codexErrorInfo"] == "usageLimitExceeded"
		reset := providerLimitReset(data, now)
		// A structured rate_limit without reset/plan evidence remains transient overload.
		if codex || (plan && (data["errorKind"] == nil || data["errorKind"] == "rate_limit")) || (data["errorKind"] == "rate_limit" && reset != nil) {
			if reset == nil {
				reset = clockReset(message, now)
			}
			return &ProviderLimitError{ResetsAt: reset}
		}
		return nil
	}
	text := strings.TrimSpace(strings.SplitN(err.Error(), "\n", 2)[0])
	if text == "provider_limit_reached" {
		return &ProviderLimitError{}
	}
	// Bare provider messages are source-prefixed. Arbitrary MCP/tool text and JSON
	// wrappers cannot become provider evidence by containing a limit phrase.
	if isPlanLimitMessage(text) {
		return &ProviderLimitError{ResetsAt: clockReset(text, now)}
	}
	if strings.HasPrefix(text, "Provider HTTP 429") || strings.HasPrefix(text, "API Error: 429") {
		// Reset-bearing API failures are also allowed to use an ISO timestamp.
		for _, word := range strings.Fields(text) {
			if parsed, e := time.Parse(time.RFC3339, strings.Trim(word, `",;`)); e == nil && parsed.After(now) {
				ms := parsed.UnixMilli()
				return &ProviderLimitError{ResetsAt: &ms}
			}
		}
	}
	return nil
}

func isPlanLimitMessage(message string) bool {
	text := strings.ToLower(message)
	for _, prefix := range []string{"you've hit your session limit", "you’ve hit your session limit", "you've hit your weekly limit", "you’ve hit your weekly limit", "you've hit your usage limit", "you’ve hit your usage limit", "you have hit your usage limit"} {
		if strings.HasPrefix(text, prefix) {
			return true
		}
	}
	return false
}

func providerLimitReset(data map[string]any, now time.Time) *int64 {
	reset := resetMillisField(data, "resetsAt", "resets_at", "resetAt", "reset_at")
	if reset != nil && *reset > now.UnixMilli() {
		return reset
	}
	return nil
}

func clockReset(message string, now time.Time) *int64 {
	match := limitClockReset.FindStringSubmatch(message)
	if match == nil {
		return nil
	}
	hour, _ := strconv.Atoi(match[1])
	minute := 0
	if match[2] != "" {
		minute, _ = strconv.Atoi(match[2])
	}
	if hour < 1 || hour > 12 || minute > 59 {
		return nil
	}
	hour %= 12
	if strings.EqualFold(match[3], "pm") {
		hour += 12
	}
	utc := now.UTC()
	reset := time.Date(utc.Year(), utc.Month(), utc.Day(), hour, minute, 0, 0, time.UTC)
	if !reset.After(now) {
		reset = reset.AddDate(0, 0, 1)
	}
	ms := reset.UnixMilli()
	return &ms
}

// Cached observations are bound to the injected credential generation. A
// replacement client must never inherit a rejection from the previous one.
type observedProviderLimit struct {
	reference  string
	generation int64
	observedAt int64
	resetsAt   *int64
}

const providerLimitObservationFreshness = 2 * time.Minute

func (h *SessionHost) observeProviderLimitLocked(payload usageReportPayload) {
	var reset *int64
	rejected := false
	for _, limit := range payload.RateLimits {
		if limit.Status != "rejected" {
			continue
		}
		rejected = true
		if limit.ResetsAt != nil && (reset == nil || *limit.ResetsAt > *reset) {
			value := *limit.ResetsAt
			reset = &value
		}
	}
	if rejected {
		h.rejectedUsageLimit = &observedProviderLimit{reference: payload.CredentialReference, generation: payload.CredentialGeneration, observedAt: payload.ObservedAt, resetsAt: reset}
	} else if h.rejectedUsageLimit != nil && h.rejectedUsageLimit.reference == payload.CredentialReference && h.rejectedUsageLimit.generation == payload.CredentialGeneration && payload.ObservedAt >= h.rejectedUsageLimit.observedAt {
		h.rejectedUsageLimit = nil
	}
}
func (h *SessionHost) promptProviderLimit(err error) *ProviderLimitError {
	limit := ClassifyProviderLimit(err, h.now())
	reason := ClassifyPromptError(err)
	if limit == nil && reason != "" && reason != "provider_overloaded" {
		return nil
	}
	attr, ok := h.credentialAttributionSnapshot()
	if !ok {
		return limit
	}
	h.usageReportMu.Lock()
	defer h.usageReportMu.Unlock()
	observation := h.rejectedUsageLimit
	if observation == nil || observation.reference != attr.CredentialReference || observation.generation != attr.CredentialGeneration || h.now().UnixMilli()-observation.observedAt > providerLimitObservationFreshness.Milliseconds() || observation.observedAt > h.now().UnixMilli() {
		return limit
	}
	if observation.resetsAt != nil && *observation.resetsAt <= h.now().UnixMilli() {
		return limit
	}
	if limit == nil {
		limit = &ProviderLimitError{}
	}
	if observation.resetsAt != nil && (limit.ResetsAt == nil || *observation.resetsAt > *limit.ResetsAt) {
		reset := *observation.resetsAt
		limit.ResetsAt = &reset
	}
	return limit
}
