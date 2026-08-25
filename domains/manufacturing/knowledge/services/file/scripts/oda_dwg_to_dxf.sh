#!/usr/bin/env bash
set -euo pipefail

input="${1:-}"
output="${2:-}"

if [[ -z "$input" || -z "$output" ]]; then
  echo "Usage: oda_dwg_to_dxf.sh INPUT.dwg OUTPUT.dxf" >&2
  exit 2
fi

converter="${ODA_FILE_CONVERTER_BIN:-/Applications/ODAFileConverter.app/Contents/MacOS/ODAFileConverter}"
if [[ ! -x "$converter" ]]; then
  echo "ODAFileConverter not found at: $converter" >&2
  echo "Set ODA_FILE_CONVERTER_BIN to the converter binary path." >&2
  exit 127
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

input_dir="$tmpdir/input"
output_dir="$tmpdir/output"
mkdir -p "$input_dir" "$output_dir"

cp "$input" "$input_dir/$(basename "$input")"

"$converter" "$input_dir" "$output_dir" "ACAD2018" "DXF" "0" "1" "*.dwg" >/dev/null

converted="$(find "$output_dir" -iname '*.dxf' -print -quit)"
if [[ -z "$converted" ]]; then
  echo "ODAFileConverter did not produce a DXF file." >&2
  exit 1
fi

mkdir -p "$(dirname "$output")"
cp "$converted" "$output"
