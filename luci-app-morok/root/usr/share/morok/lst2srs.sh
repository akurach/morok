#!/bin/sh
# lst2srs.sh <in.lst> <out.json> — конвертер текстового списка доменов
# в sing-box rule_set "source" JSON, который gen_config.uc подключает
# для правил match_type=source_list.
#
# Понимает: чистые домены построчно (re:filter и подобные), комментарии
# (#...), hosts-строки ("0.0.0.0 domain"). Мусорные строки пропускает.
# Ни одного валидного домена -> выход 1 (вызывающий оставляет старый файл).

in=$1
out=$2
[ -s "$in" ] || exit 1

awk '
	BEGIN { n = 0 }
	/^[[:space:]]*#/ { next }
	{
		line = $0
		gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
		sub(/[[:space:]]+#.*$/, "", line)          # inline-комментарий
		if (line == "") next
		if (line ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+[[:space:]]+/)
			sub(/^[0-9.]+[[:space:]]+/, "", line)  # hosts-формат
		if (line !~ /^[A-Za-z0-9*_-]+(\.[A-Za-z0-9*_-]+)+$/) next
		d[n++] = line
	}
	END {
		if (n == 0) exit 1
		printf "{\"version\":3,\"rules\":[{\"domain_suffix\":["
		for (i = 0; i < n; i++)
			printf "%s\"%s\"", (i ? "," : ""), d[i]
		printf "]}]}\n"
	}
' "$in" >"$out.tmp" || { rm -f "$out.tmp"; exit 1; }
mv "$out.tmp" "$out"
