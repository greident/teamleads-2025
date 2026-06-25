# {{ .Title }}
{{ with .Description }}
> {{ . }}
{{ end }}{{ with .Date }}_{{ .Format "02.01.2006" }}_
{{ end }}
{{ .RawContent }}
