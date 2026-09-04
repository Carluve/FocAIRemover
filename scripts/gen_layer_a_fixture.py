#!/usr/bin/env python3
"""Generate the Layer A differential fixture from the REAL upstream cleaner.

The Worker ports upstream `clean_text()` to TypeScript so plain .txt can be
cleaned without a Layer B model. This script pins that port to upstream's actual
output: it runs a corpus through the Python implementation and writes
input/expected pairs that `tests/layer-a.test.ts` asserts against.

Regenerate when upstream changes:

    python3 scripts/gen_layer_a_fixture.py \\
        --upstream ~/GitHub/watermarks-remover \\
        --out tests/fixtures/layer-a-corpus.json

Upstream: https://github.com/guillaumemeyer/watermarks-remover (MIT)
Copyright (c) Guillaume Meyer and contributors. See NOTICE.
"""
import argparse
import json
import random
import sys
from pathlib import Path

# Codepoints that exercise every branch of _decide(): carriers, emoji glue,
# script joiners, flag tags, bidi controls, fillers and homoglyphs.
INTERESTING = [
    0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF, 0x180E,  # zero-width family
    0x00AD, 0x034F, 0x2061, 0x2062, 0x2063, 0x2064,  # soft hyphen, invisibles
    0xFE0E, 0xFE0F, 0xFE00, 0xFE0D,                  # variation selectors
    0xE0100, 0xE01EF,                                # VS supplement
    0xE0020, 0xE0041, 0xE007F,                       # tag characters
    0x1F3F4, 0x1F600, 0x2764, 0x1F525, 0x1F468,      # emoji bases
    0x0023, 0x0039, 0x00A9, 0x2139, 0x2934,          # keycap/singleton bases
    0x061C, 0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E,
    0x2066, 0x2067, 0x2068, 0x2069,                  # bidi
    0x0645, 0x06CC, 0x0915, 0x0937,                  # Arabic/Devanagari letters
    0x180B, 0x180F, 0x1820,                          # Mongolian FVS + letter
    0x17B4, 0x17B5, 0x1780,                          # Khmer
    0x115F, 0x1160, 0x3164, 0xFFA0, 0x1100, 0x3131,  # Hangul fillers/jamo
    0x4E00, 0x9FFF,                                  # CJK ideographs
    0x00A0, 0x2003, 0x3000, 0x205F,                  # space homoglyphs
    0x0430, 0x03BF, 0x0131,                          # Latin confusables
    0xFDD0, 0xFFFE, 0x1FFFE,                         # noncharacters
    0xE000, 0xF8FF, 0xF0000,                         # private use
    0x2065, 0xE0000, 0xFFF0, 0xE0080,                # reserved ignorable
    0x13430, 0x13000, 0x1BCA0, 0x1D173, 0x1D100,     # layout Cf controls
    0x0600, 0x06DD, 0x110BD,                         # orthographic Cf
    0x0041, 0x0061, 0x0020, 0x000A, 0x0301,          # ordinary text
]

HANDMADE = [
    "",
    "plain ascii text",
    "Este texto​ lleva marcas​ invisibles​.",
    "zero​width​space",
    "bom﻿inside",
    "soft­hyphen",
    # Emoji sequences whose glue must survive.
    "❤️‍\U0001f525",
    "\U0001f468‍\U0001f469‍\U0001f467",
    "\U0001f3f4\U000e0067\U000e0062\U000e0073\U000e0063\U000e0074\U000e007f",
    "\U0001f3f4\U000e0067\U000e0062",  # incomplete flag tag sequence
    "3️⃣",
    "ℹ️",
    "©️",
    # Complex-script orthography.
    "می‌روم",
    "क्‍ष",
    "‌ isolated joiner",
    "ᠠ᠋ mongolian",
    "᠋ orphan fvs",
    "ក឴ khmer",
    "ᄀᅟ hangul",
    "ㄱㅤ compat",
    # Bidi.
    "a‫RTL‬b",
    "a‮OVERRIDE‬b",
    "a‫unclosed",
    "a‎LRM‏b",
    # CJK + variation selectors.
    "一︀",
    "一\U000e0100",
    "A\U000e0100",
    # Layout Cf controls next to and away from their script.
    "\U00013000\U00013430\U00013001",
    "abc\U00013430def",
    "\U0001d100\U0001d173\U0001d101",
    # Spaces and homoglyphs.
    "wide　space",
    "nbsp here",
    "narrow space",
    # Contraband classes.
    "noncharacter￾here",
    "privateuse",
    "reserved⁥ignorable",
    "tag\U000e0041char",
    "invisible⁢times",
    # Mixed torture case.
    "A​❤️‍\U0001f525​می‌ر Z﻿",
]


def build_random(count: int, seed: int) -> list[str]:
    rng = random.Random(seed)
    letters = "abcdefghij ABCDEFG\n"
    out = []
    for _ in range(count):
        length = rng.randint(1, 24)
        chars = []
        for _ in range(length):
            if rng.random() < 0.55:
                chars.append(rng.choice(letters))
            else:
                chars.append(chr(rng.choice(INTERESTING)))
        out.append("".join(chars))
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--upstream", required=True, help="watermarks-remover checkout")
    parser.add_argument("--out", required=True)
    parser.add_argument("--random", type=int, default=600)
    parser.add_argument("--seed", type=int, default=20260904)
    args = parser.parse_args()

    scripts = Path(args.upstream).expanduser() / "service" / "scripts"
    if not (scripts / "text_unicode.py").exists():
        print(f"no text_unicode.py under {scripts}", file=sys.stderr)
        return 1
    sys.path.insert(0, str(scripts))
    from text_unicode import clean_text  # noqa: E402

    corpus = HANDMADE + build_random(args.random, args.seed)
    # Option combinations the Worker can be asked for.
    variants = [
        {},
        {"normalize_spaces": False},
        {"aggressive_homoglyphs": True},
        {"nfkc": True},
    ]

    cases = []
    for text in corpus:
        for options in variants:
            cleaned, _stats = clean_text(text, **options)
            cases.append({"input": text, "options": options, "expected": cleaned})

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(cases, ensure_ascii=False, indent=0))
    print(f"wrote {len(cases)} cases to {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
