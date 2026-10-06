# Installer typeface

Nexus Sans is a limited UI-character subset of Noto Sans SC, distributed under the SIL Open Font License 1.1 in `OFL.txt`. The derivative family is renamed Nexus Sans. Regular and SemiBold are static instances of weights 400 and 600. The subset is bundled solely for consistent installer typography, not installed into the operating system.

Source: https://github.com/google/fonts/tree/main/ofl/notosanssc

Copyright 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name Source.

Source variable TTF SHA256: `a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da`.

The installer build checks both weights against the current interface text, including the model catalog. To regenerate the subsets, run `python scripts/installer_fonts.py --source /path/to/NotoSansSC.ttf` with fontTools installed; the source hash must match the pinned value above. Ordinary builds use the checked-in fonts and need no font tooling.
