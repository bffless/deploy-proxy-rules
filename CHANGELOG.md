# Changelog

## [1.2.0](https://github.com/bffless/deploy-proxy-rules/compare/v1.1.0...v1.2.0) (2026-07-14)


### Features

* one compile per set, and push errors in this action's terms ([c5c2c4c](https://github.com/bffless/deploy-proxy-rules/commit/c5c2c4cbe2e2277f87f6dc949eb44e86b2c66b7c))
* one compile per set, and push errors in this action's terms ([c9e806a](https://github.com/bffless/deploy-proxy-rules/commit/c9e806acf2a27109cadf06d0446459e991431736))

## [1.1.0](https://github.com/bffless/deploy-proxy-rules/compare/v1.0.0...v1.1.0) (2026-07-13)


### Features

* support TypeScript (.fn.ts) handlers ([1a3434e](https://github.com/bffless/deploy-proxy-rules/commit/1a3434ef15a5b2f196ee4e8506d22bbb89da9e36))
* support TypeScript (.fn.ts) handlers ([8d1aa09](https://github.com/bffless/deploy-proxy-rules/commit/8d1aa09851b69206c6643bff3b50f109f97c48df)), closes [#2](https://github.com/bffless/deploy-proxy-rules/issues/2)

## 1.0.0 (2026-07-12)


### Features

* change report markdown + step summary + PR comment upsert ([9e5fe3a](https://github.com/bffless/deploy-proxy-rules/commit/9e5fe3a3d7a363c653e33ebfddcb8c7ab918a8eb))
* inputs module (path list parsing, booleans, secrets) ([985ef5e](https://github.com/bffless/deploy-proxy-rules/commit/985ef5ef816f4dd4924bfaf814e917b641a735f2))
* scaffold deploy-proxy-rules action (build spike: ncc bundles ESM bffless/lib) ([dea308a](https://github.com/bffless/deploy-proxy-rules/commit/dea308aa0d3f151519c7c5e804ae9122498c42b0))
* sync runner (validate -&gt; push per set) + outputs mapping ([bb3da4c](https://github.com/bffless/deploy-proxy-rules/commit/bb3da4cb99f2f0890041e52ea3d3890f986b31e4))
* wire run() + README + bundle smoke test; rebuild dist ([f386c4c](https://github.com/bffless/deploy-proxy-rules/commit/f386c4c1f8d4d9acdea35db8d3f96335b8330de8))


### Bug Fixes

* consume published bffless@^0.1.0; rebuild dist ([3e2c0d0](https://github.com/bffless/deploy-proxy-rules/commit/3e2c0d01c3f41fbe41255f64d129b3258bae609f))
* dist-freshness check catches untracked files; github-token defaults to github.token ([ac42aa3](https://github.com/bffless/deploy-proxy-rules/commit/ac42aa3d4323b839316266ca16ea062879cb99dd))
