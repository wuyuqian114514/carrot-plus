#!/bin/bash

# Requires jq (https://stedolan.github.io/jq/)
#
# Local installation
#   Firefox: Install directly
#   Chrome: Run ./build.sh -c, install tmp-chrome/carrot
#
# Preparing the zip for release
#   ./build.sh -f -c -z will prepare the zips in release/


set -e

USAGE='Usage: [-f|--firefox] [-c|--chrome] [-z|--zip]
  At least one of -f or -c must be present.
  -f must be accompanied by -z.'

shopt -s extglob

copy_carrot() {
  local copy_dir="$1"
  mkdir -p "${copy_dir}/carrot"

  # Copy everything except the tests.
  cp -r carrot/!(tests) "${copy_dir}/carrot"
}

jq_manifest_replace() {
  local jq_command="$1"
  local manifest_file="$2"
  local manifest_file_tmp="${manifest_file}.tmp"
  jq "${jq_command}" "${manifest_file}" > "${manifest_file_tmp}"
  mv "${manifest_file_tmp}" "${manifest_file}"
}

pack_firefox() {
  local firefox_zip="$1"
  local copy_dir="$2"
  local release_dir="$3"

  mkdir -p "${release_dir}"
  printf "Packing ${release_dir}/${firefox_zip}..."

  copy_carrot "${copy_dir}"
  cd "${copy_dir}/carrot"

  # Prepare the zip.
  rm -f "../../${release_dir}/${firefox_zip}"
  zip -q -r "../../${release_dir}/${firefox_zip}" .

  # Clean up.
  cd ../..
  rm -r "${copy_dir}/carrot"

  printf " Done!\n"
}

pack_chrome() {
  local chrome_zip="$1"
  local copy_dir="$2"
  local release_dir="$3"

  if [[ -n "${release_dir}" ]]; then
    mkdir -p "${release_dir}"
    printf "Packing ${release_dir}/${chrome_zip}..."
  else
    printf "Setting up ${copy_dir}/carrot..."
  fi

  copy_carrot "${copy_dir}"
  cd "${copy_dir}"

  # Download the polyfill.
  local polyfill_url='https://unpkg.com/webextension-polyfill@0.12.0/dist/browser-polyfill.min.js'
  local polyfill_download_path='downloads/browser-polyfill.min.js'
  local polyfill_path='polyfill/browser-polyfill.min.js'
  mkdir -p downloads
  if [[ ! -f "${polyfill_download_path}" ]]; then
    curl -s -o "${polyfill_download_path}" "${polyfill_url}"
    sed -i '/sourceMappingURL/ d' "${polyfill_download_path}"
  fi
  mkdir -p "carrot/$(dirname "${polyfill_path}")"
  cp "${polyfill_download_path}" "carrot/${polyfill_path}"

  cd carrot

  # Insert the polyfill before the first script tag in every html file.
  local polyfill_script="<script src=\"\/${polyfill_path/\//\\\/}\"><\/script>"
  shopt -s globstar
  for html_file in **/*.html; do
    sed -i -r "0,/<script/ s/((\s+)<script)/\2${polyfill_script}\n\1/" "${html_file}"
  done

  # Import the polyfill in background.js.
  sed -i -e "1iimport '../../${polyfill_path}';" src/background/background.js

  # Add the polyfill as content script.
  jq_manifest_replace ".content_scripts[].js |= [\"${polyfill_path}\"] + ." manifest.json

  # Change the background script to service_worker
  jq_manifest_replace '.background.service_worker = .background.scripts[0] |
      del(.background.scripts)' manifest.json

  if command -v rsvg-convert >/dev/null 2>&1; then
    # Prepare png icons from svg when librsvg is available.
    icon_sizes=(16 32 48 128)
    icons_json=''
    for size in ${icon_sizes[@]}; do
      rsvg-convert -w "${size}" -h "${size}" -o "icons/icon${size}.png" icons/icon.svg
      icons_json="${icons_json},\"${size}\":\"icons/icon${size}.png\""
    done
    rm icons/icon.svg
    icons_json="{${icons_json:1}}"

    # Set png icons in the manifest.
    jq_manifest_replace ".icons = ${icons_json} |
        .action.default_icon = \"icons/icon${icon_sizes[-1]}.png\"" manifest.json
  else
    printf " rsvg-convert not found; generating fallback PNG icons..."
    icon_sizes=(16 32 48 128)
    python3 - <<'PY'
import math
import os
import struct
import zlib

def write_png(path, size):
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            cx = x + 0.5
            cy = y + 0.5
            orange = (
                cy > size * 0.25
                and abs(cx - size * 0.47) < (cy - size * 0.15) * 0.34
                and cy < size * 0.94
            )
            green = (
                cy < size * 0.35
                and (
                    (cx - size * 0.57) ** 2 / (size * 0.25) ** 2
                    + (cy - size * 0.22) ** 2 / (size * 0.12) ** 2
                    < 1
                    or (cx - size * 0.38) ** 2 / (size * 0.18) ** 2
                    + (cy - size * 0.20) ** 2 / (size * 0.10) ** 2
                    < 1
                )
            )
            if green:
                row.extend((126, 176, 23, 255))
            elif orange:
                shade = int(210 + 35 * cy / size)
                row.extend((shade, 110, 20, 255))
            else:
                row.extend((0, 0, 0, 0))
        rows.append(bytes(row))

    raw = b''.join(rows)
    def chunk(kind, data):
        return (
            struct.pack('>I', len(data))
            + kind
            + data
            + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
        )

    png = (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )
    with open(path, 'wb') as f:
        f.write(png)

os.makedirs('icons', exist_ok=True)
for size in (16, 32, 48, 128):
    write_png(f'icons/icon{size}.png', size)
PY
    rm icons/icon.svg
    icons_json=''
    for size in ${icon_sizes[@]}; do
      icons_json="${icons_json},\"${size}\":\"icons/icon${size}.png\""
    done
    icons_json="{${icons_json:1}}"
    jq_manifest_replace ".icons = ${icons_json} |
        .action.default_icon = \"icons/icon${icon_sizes[-1]}.png\"" manifest.json
  fi

  # Final touches to manifest.json.
  jq_manifest_replace 'del(.browser_specific_settings)' manifest.json

  if [[ -n "${release_dir}" ]]; then
    # Prepare the zip.
    rm -f "../../${release_dir}/${chrome_zip}"
    zip -q -r "../../${release_dir}/${chrome_zip}" .
  fi
  
  cd ../..

  # Don't clean up copy_dir/carrot since it is used for local installation.

  printf " Done!\n"
}

main() {
  local help=0
  local firefox=0
  local chrome=0
  local zip=0
  local unknown=()

  while (($# > 0)); do
    arg="$1"
    case "${arg}" in
      -h|--help)
        help=1
        shift
        ;;
      -f|--firefox)
        firefox=1
        shift
        ;;
      -c|--chrome)
        chrome=1
        shift
        ;;
      -z|--zip)
        zip=1
        shift
        ;;
      *)
        unknown+=("$1")
        shift
        ;;
    esac
  done

  if ((help != 0)); then
    echo "${USAGE}"
    exit
  fi

  if ((${#unknown[@]} != 0)); then
    echo "Unknown args: ${unknown[@]}"
    echo "  -h to see usage"
    exit 1
  fi

  if ((firefox == 0 && chrome == 0)); then
    echo "At least one of -f|--firefox or -c|--chrome expected"
    exit 1
  fi

  if ((firefox != 0 && zip == 0)); then
    echo "-f|--firefox must be accompanied by -z|--zip"
    exit 1
  fi


  local version=$(jq -r .version carrot/manifest.json)
  
  local release_dir=''
  if ((zip != 0)); then
    release_dir='release'
  fi

  if ((firefox != 0)); then
    firefox_zip="carrot-firefox-v${version}.zip"
    pack_firefox "${firefox_zip}" tmp-firefox "${release_dir}"
  fi

  if ((chrome != 0)); then
    chrome_zip="carrot-chrome-v${version}.zip"
    pack_chrome "${chrome_zip}" tmp-chrome "${release_dir}"
  fi
}

main "$@"
