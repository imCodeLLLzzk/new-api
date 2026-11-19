#!/usr/bin/env bash
#
# 构建 new-api 私有镜像（多架构）并推送到私有 registry。
#
# 用法:
#   ./docker/build-push.sh                     # 多架构构建 + 推送
#   ./docker/build-push.sh v1.0.0-rc.49       # 指定版本号
#   ./docker/build-push.sh --local             # 只构建到本地（单架构，不推送）
#   ./docker/build-push.sh --no-push           # 多架构构建但不推送
#
# 环境变量:
#   IMAGE      镜像名       默认 192.168.0.163:5000/new-api
#   TAG        镜像 tag     默认 latest
#   PLATFORMS  目标平台     默认 linux/amd64,linux/arm64
#   BUILDER    buildx builder 名  默认 mybuilder
#
# 版本号默认沿用官方 .github/workflows/release.yml 的推导方式：
#   git describe --tags --match 'v[0-9]*'
# 即「最近的官方 release tag + 距离它的 commit 数 + 精确 commit」。
# 官方切新 tag 后本脚本无需修改。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

IMAGE="${IMAGE:-192.168.0.163:5000/new-api}"
TAG="${TAG:-latest}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
BUILDER="${BUILDER:-mybuilder}"
VERSION=""
PUSH=1
OUTPUT_ARGS=(--push)

usage() {
  cat <<'EOF'
构建 new-api 私有镜像（多架构）并推送到私有 registry。

用法:
  ./docker/build-push.sh                     # 多架构构建 + 推送
  ./docker/build-push.sh v1.0.0-rc.49       # 指定版本号
  ./docker/build-push.sh --local             # 只构建到本地（单架构，不推送）
  ./docker/build-push.sh --no-push           # 多架构构建但不推送
  ./docker/build-push.sh --image <名> --tag <tag> --platforms <平台列表>

环境变量:
  IMAGE      镜像名            默认 192.168.0.163:5000/new-api
  TAG        镜像 tag          默认 latest
  PLATFORMS  目标平台          默认 linux/amd64,linux/arm64
  BUILDER    buildx builder 名 默认 mybuilder

版本号默认沿用官方 .github/workflows/release.yml 的推导方式：
  git describe --tags --match 'v[0-9]*'
即「最近的官方 release tag + 距离它的 commit 数 + 精确 commit」。
官方切新 tag 后本脚本无需修改。
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --local)
      PUSH=0
      OUTPUT_ARGS=(--load)
      # --load 不支持多架构，本地模式只构建当前架构
      case "$(uname -m)" in
        arm64|aarch64) PLATFORMS="linux/arm64" ;;
        *)             PLATFORMS="linux/amd64" ;;
      esac
      shift ;;
    --no-push) PUSH=0; OUTPUT_ARGS=(); shift ;;
    --image)    IMAGE="$2"; shift 2 ;;
    --tag)      TAG="$2"; shift 2 ;;
    --platforms) PLATFORMS="$2"; shift 2 ;;
    -h|--help)  usage; exit 0 ;;
    -*)         echo "未知参数: $1" >&2; usage >&2; exit 1 ;;
    *)          VERSION="$1"; shift ;;
  esac
done

# ---- 版本号：与官方 release.yml 保持一致 ----
if [ -z "$VERSION" ]; then
  if ! git rev-parse --git-dir >/dev/null 2>&1; then
    echo "错误：$REPO_ROOT 不是 git 仓库，无法推导版本号" >&2
    echo "      请显式指定：$0 <版本号>" >&2
    exit 1
  fi
  VERSION="$(git describe --tags --match 'v[0-9]*' 2>/dev/null || true)"
  if [ -z "$VERSION" ]; then
    echo "错误：无法推导版本号（仓库中没有 v* tag）" >&2
    echo "      请显式指定：$0 <版本号>" >&2
    exit 1
  fi
fi

# ---- builder ----
if ! docker buildx inspect "$BUILDER" >/dev/null 2>&1; then
  echo "==> 创建 buildx builder: $BUILDER"
  docker buildx create --name "$BUILDER" --driver docker-container \
    --config "$SCRIPT_DIR/buildkitd.toml" --bootstrap
fi

echo "==> 镜像      : $IMAGE:$TAG"
echo "==> 版本号    : $VERSION"
echo "==> 目标平台  : $PLATFORMS"
echo "==> 输出方式  : ${OUTPUT_ARGS[*]:-<无>}"
echo

docker buildx build --builder "$BUILDER" \
  -f "$SCRIPT_DIR/Dockerfile.private" \
  --platform "$PLATFORMS" \
  --build-arg APP_VERSION="$VERSION" \
  -t "$IMAGE:$TAG" \
  "${OUTPUT_ARGS[@]}" \
  "$REPO_ROOT"

echo
if [ "$PUSH" = "1" ]; then
  echo "==> 推送完成: $IMAGE:$TAG  (版本 $VERSION)"
else
  echo "==> 构建完成（未推送）: $IMAGE:$TAG  (版本 $VERSION)"
fi
echo "==> 验证: docker run --rm $IMAGE:$TAG --version"
