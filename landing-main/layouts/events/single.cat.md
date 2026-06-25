# {{ .Title }}
{{ with .Params.mainTopic }}
**Основная тема:** {{ . }}
{{ end }}
{{- with .Params.participants }}
## Участники
{{ range . }}- **{{ .name }}**{{ with .role }} — {{ . }}{{ end }}
{{ end }}{{ end }}
{{- with .Params.topics }}
## Подтемы и их суть
{{ range $i, $t := . }}
### {{ add $i 1 }}. {{ $t.title }}
{{ $t.body }}
{{ end }}{{ end }}
{{- with .Params.opinions }}
## Различные мнения

| Вопрос | {{ delimit .columns " | " }} |
|---|{{ range .columns }}---|{{ end }}
{{ range .rows }}| {{ .question }} | {{ delimit .values " | " }} |
{{ end }}{{ end }}
{{- with .Params.takeaways }}
## Основные выводы
{{ range . }}
### {{ .title }}
{{ .body }}
{{ end }}{{ end }}
{{- with .Params.nextQuestions }}
## Что обсудим дальше
{{ range . }}- {{ .question }}{{ with .answeredIn }} — обсудили в {{ . }}{{ end }}
{{ end }}{{ end }}
