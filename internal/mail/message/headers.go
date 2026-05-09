package message

import (
	"io"
	"mime"
	"strings"

	"golang.org/x/text/encoding/htmlindex"
)

func DecodeHeader(s string) string {
	if !strings.Contains(s, "=?") {
		return s
	}
	decoder := mime.WordDecoder{
		CharsetReader: func(charset string, input io.Reader) (io.Reader, error) {
			enc, err := htmlindex.Get(charset)
			if err != nil {
				return nil, err
			}
			return enc.NewDecoder().Reader(input), nil
		},
	}
	out, err := decoder.DecodeHeader(s)
	if err != nil || out == "" {
		return s
	}
	return out
}
