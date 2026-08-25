{{- define "monkeybrain.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "monkeybrain.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "monkeybrain.fullname" -}}
{{ .Release.Name }}-{{ .Chart.Name }}
{{- end }}

{{- define "monkeybrain.mongodbUrl" -}}
{{- if .Values.mongodb.enabled -}}
mongodb://{{ .Release.Name }}-mongodb:27017
{{- else -}}
mongodb://localhost:27017
{{- end -}}
{{- end }}

{{- define "monkeybrain.redisUrl" -}}
{{- if .Values.redis.enabled -}}
redis://{{ .Release.Name }}-redis-master:6379
{{- else -}}
redis://localhost:6379
{{- end -}}
{{- end }}
