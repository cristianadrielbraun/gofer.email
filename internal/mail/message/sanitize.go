package message

import (
	"regexp"
	"strings"
)

func SanitizeHTML(input []byte) []byte {
	if len(input) == 0 {
		return nil
	}

	sanitized := removeDangerousTags(input)
	sanitized = blockRemoteImages(sanitized)

	return sanitized
}

func RewriteCIDReferences(html []byte, cidToURL map[string]string) []byte {
	if len(cidToURL) == 0 {
		return html
	}
	s := string(html)
	for cid, url := range cidToURL {
		s = strings.ReplaceAll(s, `cid:`+cid, url)
	}
	return []byte(s)
}

var dangerousElements = []string{
	"script", "iframe", "object", "embed", "form", "meta", "link",
}

func removeDangerousTags(html []byte) []byte {
	s := string(html)

	for _, tag := range dangerousElements {
		re := regexp.MustCompile(`(?is)<` + tag + `\b[^>]*>.*?</` + tag + `\s*>`)
		s = re.ReplaceAllString(s, "")
		reOpen := regexp.MustCompile(`(?is)<` + tag + `\b[^>]*/?\s*>`)
		s = reOpen.ReplaceAllString(s, "")
	}

	reEventAttr := regexp.MustCompile(`(?i)\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)`)
	s = reEventAttr.ReplaceAllString(s, "")

	reJavascript := regexp.MustCompile(`(?i)href\s*=\s*["']javascript:[^"']*["']`)
	s = reJavascript.ReplaceAllString(s, `href="#"`)

	return []byte(s)
}

func blockRemoteImages(html []byte) []byte {
	s := string(html)

	reImgDouble := regexp.MustCompile(`(?i)(<img\b[^>]*?\s)src\s*=\s*"((https?://)[^"]*)"`)
	s = reImgDouble.ReplaceAllString(s, `${1}src="" data-remote-src="$2"`)

	reImgSingle := regexp.MustCompile(`(?i)(<img\b[^>]*?\s)src\s*=\s*'((https?://)[^']*)'`)
	s = reImgSingle.ReplaceAllString(s, `${1}src="" data-remote-src='$2'`)

	reCSSUrl := regexp.MustCompile(`(?i)url\s*\(\s*['"]?(https?://[^)'"]*?)['"]?\s*\)`)
	s = reCSSUrl.ReplaceAllString(s, `url("")`)

	return []byte(s)
}

func RestoreRemoteImages(html []byte) []byte {
	s := string(html)

	reImgDouble := regexp.MustCompile(`(?i)(<img\b[^>]*?\s)src\s*=\s*""\s+data-remote-src="([^"]*)"`)
	s = reImgDouble.ReplaceAllString(s, `${1}src="$2"`)

	reImgSingle := regexp.MustCompile(`(?i)(<img\b[^>]*?\s)src\s*=\s*''\s+data-remote-src='([^']*)'`)
	s = reImgSingle.ReplaceAllString(s, `${1}src='$2'`)

	s = strings.ReplaceAll(s, `url("")`, ``)

	return []byte(s)
}

func IsRemoteImagesBlocked(html string) bool {
	return strings.Contains(html, "data-remote-src")
}

var reExtractRemoteSrcs = regexp.MustCompile(`(?i)data-remote-src=["']([^"']+)["']`)

func ExtractRemoteURLs(html string) []string {
	matches := reExtractRemoteSrcs.FindAllStringSubmatch(html, -1)
	seen := make(map[string]bool)
	var urls []string
	for _, m := range matches {
		if len(m) > 1 && !seen[m[1]] {
			seen[m[1]] = true
			urls = append(urls, m[1])
		}
	}
	return urls
}

func RewriteToLocalAssets(html []byte, urlToLocal map[string]string) []byte {
	s := string(html)
	for remoteURL, localPath := range urlToLocal {
		s = strings.ReplaceAll(s, `src="" data-remote-src="`+remoteURL+`"`, `src="`+localPath+`"`)
		s = strings.ReplaceAll(s, `src='' data-remote-src='`+remoteURL+`'`, `src='`+localPath+`'`)
		s = strings.ReplaceAll(s, `data-remote-src="`+remoteURL+`"`, `src="`+localPath+`"`)
		s = strings.ReplaceAll(s, `data-remote-src='`+remoteURL+`'`, `src='`+localPath+`'`)
	}
	s = strings.ReplaceAll(s, `data-remote-src="`, `data-removed-src="`)
	s = strings.ReplaceAll(s, `data-remote-src='`, `data-removed-src='`)
	return []byte(s)
}
