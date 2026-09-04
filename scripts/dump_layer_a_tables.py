import json, sys
sys.path.insert(0, sys.argv[1] if len(sys.argv) > 1 else "../watermarks-remover/service/scripts")
import text_unicode as t

def rng(r):
    return [r.start, r.stop]

out = {
    "STRIP_CODEPOINTS": sorted(t.STRIP_CODEPOINTS),
    "SPACE_HOMOGLYPHS": {str(k): v for k, v in sorted(t.SPACE_HOMOGLYPHS.items())},
    "LATIN_CONFUSABLES": {str(k): v for k, v in sorted(t.LATIN_CONFUSABLES.items())},
    "VS_SUPPLEMENT": rng(t._VS_SUPPLEMENT),
    "RESERVED_IGNORABLE_CPS": sorted(t._RESERVED_IGNORABLE_CPS),
    "RESERVED_IGNORABLE_RANGES": [rng(r) for r in t._RESERVED_IGNORABLE_RANGES],
    "BIDI_CPS": sorted(t._BIDI_CPS),
    "PRESERVABLE_BIDI_CPS": sorted(t._PRESERVABLE_BIDI_CPS),
    "LAYOUT_CF_CONTROLS": [[rng(a), rng(b)] for a, b in t._LAYOUT_CF_CONTROLS],
    "ZW_FAMILY": sorted(t._ZW_FAMILY),
    "EMOJI_GLUE_CODEPOINTS": sorted(t.EMOJI_GLUE_CODEPOINTS),
    "SCRIPT_JOINERS": sorted(t._SCRIPT_JOINERS),
    "TAG_RANGE": rng(t._TAG_RANGE),
    "ORTHOGRAPHIC_CF": sorted(t._ORTHOGRAPHIC_CF),
    "MONGOLIAN_FVS": sorted(t._MONGOLIAN_FVS),
    "KHMER_VOWELS": sorted(t._KHMER_VOWELS),
    "HANGUL_FILLERS": sorted(t._HANGUL_FILLERS),
    "SCRIPT_GLUE": sorted(t._SCRIPT_GLUE),
}
print(json.dumps(out))
