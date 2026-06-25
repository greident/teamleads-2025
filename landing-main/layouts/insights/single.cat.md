# {{ .Title }}
{{ with .Params.period }}_Инсайты за {{ . }}{{ with $.Params.messagesCount }} · {{ . }} сообщений{{ end }}_
{{ end }}{{ with .Description }}
> {{ . }}
{{ end }}
{{- range .Params.topics }}
## {{ .title }}
{{ range .paragraphs }}
{{ . }}
{{ end }}{{ with .quotes }}
{{ range . }}> {{ . }}
{{ end }}{{ end }}{{ with .links }}{{ range . }}- [{{ .title }}]({{ .url }})
{{ end }}{{ end }}{{ end }}
