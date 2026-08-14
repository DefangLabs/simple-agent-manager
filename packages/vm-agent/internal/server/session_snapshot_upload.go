package server

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type countingReader struct {
	r    io.Reader
	n    int64
	hash hashWriter
}

type hashWriter interface {
	Write([]byte) (int, error)
	Sum([]byte) []byte
}

func (r *countingReader) Read(p []byte) (int, error) {
	n, err := r.r.Read(p)
	if n > 0 {
		r.n += int64(n)
		_, _ = r.hash.Write(p[:n])
	}
	return n, err
}

func snapshotFileIdentity(filePath string) (int64, string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return 0, "", err
	}
	defer file.Close()
	fileInfo, err := file.Stat()
	if err != nil {
		return 0, "", err
	}
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return 0, "", err
	}
	return fileInfo.Size(), hex.EncodeToString(hash.Sum(nil)), nil
}

func (s *Server) uploadSessionSnapshotArtifact(ctx context.Context, legacyPath, directUploadPath, filePath, token string, idleTimeout time.Duration) (int64, string, error) {
	size, checksum, err := snapshotFileIdentity(filePath)
	if err != nil {
		return 0, "", err
	}
	if strings.TrimSpace(directUploadPath) != "" {
		uploadURL, authorizeErr := s.authorizeSessionSnapshotDirectUpload(ctx, directUploadPath, token, size, checksum)
		if authorizeErr != nil {
			return 0, "", authorizeErr
		}
		return s.uploadPreparedSnapshotFile(ctx, uploadURL, filePath, "", size, checksum, idleTimeout)
	}
	return s.uploadPreparedSnapshotFile(ctx, legacyPath, filePath, token, size, checksum, idleTimeout)
}

func (s *Server) authorizeSessionSnapshotDirectUpload(ctx context.Context, authorizationPath, token string, size int64, checksum string) (string, error) {
	payload, err := json.Marshal(map[string]interface{}{"sizeBytes": size, "sha256": checksum})
	if err != nil {
		return "", err
	}
	target := absoluteControlPlaneURL(s.config.ControlPlaneURL, authorizationPath)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res, err := s.controlPlaneHTTPClient(0).Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1024*1024))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", fmt.Errorf("direct artifact upload authorization failed HTTP %d: %s", res.StatusCode, strings.TrimSpace(string(body)))
	}
	var response struct {
		UploadURL string `json:"uploadUrl"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		return "", err
	}
	if strings.TrimSpace(response.UploadURL) == "" {
		return "", fmt.Errorf("direct artifact upload authorization returned no URL")
	}
	return response.UploadURL, nil
}

func (s *Server) uploadSnapshotFile(ctx context.Context, uploadPath, filePath, token string, idleTimeout time.Duration) (int64, string, error) {
	size, checksum, err := snapshotFileIdentity(filePath)
	if err != nil {
		return 0, "", err
	}
	return s.uploadPreparedSnapshotFile(ctx, uploadPath, filePath, token, size, checksum, idleTimeout)
}

func (s *Server) uploadPreparedSnapshotFile(ctx context.Context, uploadPath, filePath, token string, size int64, checksum string, idleTimeout time.Duration) (int64, string, error) {
	target := absoluteControlPlaneURL(s.config.ControlPlaneURL, uploadPath)
	file, err := os.Open(filePath)
	if err != nil {
		return 0, "", err
	}
	defer file.Close()
	uploadHash := sha256.New()
	reader := &countingReader{r: file, hash: uploadHash}
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, target, newIdleReader(reader, idleTimeout))
	if err != nil {
		return 0, "", err
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("X-SAM-Content-SHA256", checksum)
	}
	req.ContentLength = size
	res, err := s.controlPlaneHTTPClient(0).Do(req)
	if err != nil {
		return 0, "", err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 64*1024))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return 0, "", fmt.Errorf("artifact upload failed HTTP %d: %s", res.StatusCode, strings.TrimSpace(string(body)))
	}
	uploadSHA := hex.EncodeToString(uploadHash.Sum(nil))
	if reader.n != size || uploadSHA != checksum {
		return 0, "", fmt.Errorf("snapshot artifact changed during upload")
	}
	return reader.n, checksum, nil
}
