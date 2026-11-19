# Licensing

_Note: This document explains how Liv is licensed in plain language. It is not legal advice. Consult your own legal counsel if you have questions about compliance._

## Dual licensing model

The Liv monorepo (including the Liv desktop app, the Liv agent sidecar, Core cloud infrastructure, and all workspace packages) is distributed under a dual license:

1. **AGPL-3.0-only (Open Source):** Every package in this repository is available under the [GNU Affero General Public License v3.0 only](LICENSE) (`SPDX-License-Identifier: AGPL-3.0-only`).
2. **Commercial License:** Agrointel offers a paid commercial license for organizations that cannot comply with the obligations of AGPL-3.0-only. See [COMMERCIAL.md](COMMERCIAL.md) for details.

## What AGPL-3.0-only means in practice

- **Farmers and self-hosters:** You can install Liv on your farm PC, run Liv locally, write custom connectors for your own equipment, and self-host Core for your farm without paying a license fee.
- **Open-source contributors and researchers:** You can fork, modify, and share Liv under AGPL-3.0-only as long as your derivative work remains licensed under AGPL-3.0-only and you provide the complete corresponding source code to users who interact with it locally or over a network.
- **Commercial integrators and OEMs:** If you distribute modified versions of Liv, embed `@liv/agent`, `@liv/schema`, or `@liv/connectors` into a closed-source application, or offer a hosted service based on Liv without releasing your complete source code under AGPL-3.0-only, you must purchase a commercial license from Agrointel.

## Separate paid services and model weights

This repository contains the source code for Liv and Core. Two related offerings are separate from the open-source codebase and are not granted under the AGPL-3.0-only license:

- **Agrointel livestock vision model weights:** Pre-trained computer-vision weights for cattle and horses (run locally on a Jetson edge box or in the cloud) are proprietary to Agrointel and licensed separately.
- **Hosted Core API and LLM gateway:** You can run Liv purely locally with your own LLM API keys or self-host Core, or you can subscribe to Agrointel's hosted Core sync service and metered LLM gateway.

## Contributor License Agreement (CLA)

To make dual licensing possible, contributors sign our [Contributor License Agreement](CLA.md) before we merge pull requests. You keep ownership of your copyright while granting Agrointel the right to distribute your contribution under both AGPL-3.0-only and commercial terms.

## Contact

For licensing questions or commercial inquiries, email [kristian@agrointel.no](mailto:kristian@agrointel.no).
