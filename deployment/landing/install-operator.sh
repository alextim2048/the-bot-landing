#!/usr/bin/env bash
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'root required' >&2; exit 1; }
[[ $# == 1 ]] || { echo 'usage: install-operator.sh CHECKSUMS_FILE' >&2; exit 1; }
base=$(cd -- "$(dirname -- "$0")" && pwd -P); checksums=$(realpath "$1")
[[ $checksums == "$base/operator-checksums.sha256" ]] || { echo 'unexpected checksums file' >&2; exit 1; }
(cd "$base" && sha256sum -c operator-checksums.sha256)
operator_target=/usr/local/sbin/deploy-the-bot-landing; sudoers_target=/etc/sudoers.d/the-bot-landing
operator_tmp="${operator_target}.candidate-$$"; sudoers_tmp="${sudoers_target}.candidate-$$"
operator_backup="${operator_target}.backup-$$"; sudoers_backup="${sudoers_target}.backup-$$"
had_operator=0; had_sudoers=0
cleanup(){ rm -f -- "$operator_tmp" "$sudoers_tmp"; }
rollback(){
  if ((had_operator)); then mv -f "$operator_backup" "$operator_target"; else rm -f -- "$operator_target"; fi
  if ((had_sudoers)); then mv -f "$sudoers_backup" "$sudoers_target"; else rm -f -- "$sudoers_target"; fi
  cleanup
}
trap 'rollback' ERR
[[ ! -e $operator_target || -f $operator_target ]] || { echo 'operator target is not regular' >&2; exit 1; }
[[ ! -e $sudoers_target || -f $sudoers_target ]] || { echo 'sudoers target is not regular' >&2; exit 1; }
if [[ -f $operator_target ]]; then cp -p "$operator_target" "$operator_backup"; had_operator=1; fi
if [[ -f $sudoers_target ]]; then cp -p "$sudoers_target" "$sudoers_backup"; had_sudoers=1; fi
install -o root -g root -m 0755 "$base/deploy-the-bot-landing" "$operator_tmp"
install -o root -g root -m 0440 "$base/sudoers-auth-deploy-landing" "$sudoers_tmp"
visudo -cf "$sudoers_tmp" >/dev/null
mv -f "$operator_tmp" "$operator_target"; mv -f "$sudoers_tmp" "$sudoers_target"
visudo -cf /etc/sudoers >/dev/null
rm -f -- "$operator_backup" "$sudoers_backup"; trap - ERR; cleanup
printf 'LANDING_OPERATOR_INSTALLED operator=%s sudoers=%s\n' "$operator_target" "$sudoers_target"
