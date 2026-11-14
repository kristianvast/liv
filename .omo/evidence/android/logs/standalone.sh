
set -u
export TMPDIR="/var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/tmp.hcHGQPSIVc" NODE_COMPILE_CACHE="/var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/tmp.hcHGQPSIVc/node-compile-cache" BUN_RUNTIME_TRANSPILER_CACHE_PATH="/var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/tmp.hcHGQPSIVc/bun-transpiler" GIT_MASTER=1
export JAVA_HOME=/opt/homebrew/opt/openjdk@17 ANDROID_HOME=/opt/homebrew/share/android-commandlinetools ANDROID_SDK_ROOT=/opt/homebrew/share/android-commandlinetools
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
M=/Users/kristianvastveit/projects/orbit
L="/var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/tmp.hcHGQPSIVc/standalone.log"; : > "$L"
cd "$M" && git worktree add --detach "/var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/tmp.hcHGQPSIVc/verify" cb26fe3 >> "$L" 2>&1 || { echo "STANDALONE_STEP worktree rc=1"; exit 1; }
cd "$M" && for d in node_modules $(find apps packages core -maxdepth 3 -name node_modules -type d -not -path '*/node_modules/*' | grep -v '^apps/android'); do mkdir -p "/var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/tmp.hcHGQPSIVc/verify/$(dirname "$d")"; cp -Rc "$d" "/var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/tmp.hcHGQPSIVc/verify/$d" 2>> "$L" || cp -R "$d" "/var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/tmp.hcHGQPSIVc/verify/$d"; done
cd "/var/folders/x8/7wh9r8wx4_q47yf73zz25ht00000gn/T/tmp.hcHGQPSIVc/verify"
run() { name="$1"; shift; echo "### $name" >> "$L"; ( "$@" ) >> "$L" 2>&1 < /dev/null; rc=$?; echo "### rc=$rc $name" >> "$L"; echo "STANDALONE_STEP $name rc=$rc"; }
git checkout -q --detach bf43b31 && run "bf43b31 typecheck" bun run typecheck && run "bf43b31 core tests" sh -c 'cd core/api && bun test --timeout 30000'
git checkout -q --detach a091efd && run "a091efd typecheck" bun run typecheck && run "a091efd tests" bun run test
git checkout -q --detach cb26fe3 && run "cb26fe3 typecheck" bun run typecheck; run "cb26fe3 lint" bun run lint; run "cb26fe3 test" bun run test
run "cb26fe3 android build without local.properties" sh -c 'cd apps/android && ls local.properties 2>/dev/null; ./gradlew :app:assembleDebug :app:testDebugUnitTest --console=plain'
echo "STANDALONE_DONE $(grep -c '^### rc=0' "$L") ok of $(grep -c '^### rc=' "$L"); rename words in tree: $(grep -rIl -i 'barnstar' --include=*.ts --include=*.tsx --include=*.md --include=*.kt --include=*.kts . 2>/dev/null | grep -v node_modules | wc -l | tr -d ' ')"
