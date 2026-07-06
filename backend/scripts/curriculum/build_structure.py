#!/usr/bin/env python3
"""
Transform the curriculum-extraction workflow output into a flat seed file
(curriculum-structure.json) that the TS seeder loads into the DB.

Mints the stable ids:
  grade_id   = <board>.g<indiaEquiv>            e.g. cbse.g10
  subject_id = <board>.<subjectSlug>            e.g. cbse.science   (shared across grades)
  unit_id    = <board>.g<indiaEquiv>.<slug>.u<seq>  e.g. cbse.g10.science.u3  (immutable join key)

Usage: python3 build_structure.py <workflow-output.json> [out.json]
"""
import json
import sys
import os

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.abspath(os.path.join(HERE, "..", ".."))
DEFAULT_OUT = os.path.join(BACKEND, "data", "curriculum-structure.json")

# "better" grounding wins when a subject appears across grades with different levels.
GROUND_RANK = {"structure": 0, "proxy": 1, "syllabus": 2, "textbook": 3}


def load_slices(path):
    with open(path, encoding="utf-8") as f:
        obj = json.load(f)
    # Accept either the full workflow wrapper or a bare {slices:[...]}.
    result = obj.get("result", obj)
    return result["slices"]


def main():
    if len(sys.argv) < 2:
        print("usage: build_structure.py <workflow-output.json> [out.json]")
        sys.exit(1)
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUT
    slices = load_slices(src)

    grades = {}
    subjects = {}
    units = []
    objectives = []
    key_terms = []

    for entry in slices:
        data = entry["data"]
        # Board/grade come from the SLICE (authoritative), not the agent's echoed
        # fields — agents sometimes rewrite board to a descriptive label.
        sl = entry.get("slice", {})
        board = sl.get("board") or data["board"]
        equiv = str(sl.get("indiaEquiv") or data["indiaEquiv"])
        grade_id = f"{board}.g{equiv}"
        grades[grade_id] = {
            "gradeId": grade_id,
            "board": board,
            "labelEn": sl.get("gradeLabelEn") or data.get("gradeLabelEn", f"Grade {equiv}"),
            "indiaEquiv": equiv,
        }
        for subj in data.get("subjects", []):
            slug = subj["subjectSlug"]
            subject_id = f"{board}.{slug}"
            gl = subj.get("groundingLevel", "syllabus")
            prev = subjects.get(subject_id)
            if not prev or GROUND_RANK.get(gl, 1) > GROUND_RANK.get(prev["groundingLevel"], 1):
                subjects[subject_id] = {
                    "subjectId": subject_id,
                    "board": board,
                    "subjectSlug": slug,
                    "nameEn": subj.get("nameEn", slug),
                    "nameAr": subj.get("nameAr", ""),
                    "accuracyType": subj.get("accuracyType", "A"),
                    "groundingLevel": gl,
                }
            for unit in subj.get("units", []):
                seq = int(unit.get("seq", len(units) + 1))
                unit_id = f"{board}.g{equiv}.{slug}.u{seq}"
                units.append({
                    "unitId": unit_id,
                    "board": board,
                    "subjectId": subject_id,
                    "gradeId": grade_id,
                    "seq": seq,
                    "titleEn": unit.get("titleEn", f"Unit {seq}"),
                    "titleAr": unit.get("titleAr", ""),
                })
                for i, obj_text in enumerate(unit.get("objectives", []) or []):
                    objectives.append({
                        "id": f"{unit_id}.o{i}",
                        "unitId": unit_id,
                        "seq": i,
                        "textEn": obj_text,
                        "textAr": "",
                    })
                for i, term in enumerate(unit.get("keyTerms", []) or []):
                    key_terms.append({
                        "id": f"{unit_id}.t{i}",
                        "unitId": unit_id,
                        "termEn": term.get("en", ""),
                        "termAr": term.get("ar", ""),
                    })

    result = {
        "grades": list(grades.values()),
        "subjects": list(subjects.values()),
        "units": units,
        "objectives": objectives,
        "keyTerms": key_terms,
    }
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    # Summary so the human sees coverage at a glance.
    by_board = {}
    for s in subjects.values():
        by_board.setdefault(s["board"], {"subjects": 0, "grounded": 0})
        by_board[s["board"]]["subjects"] += 1
        if s["groundingLevel"] in ("syllabus", "textbook"):
            by_board[s["board"]]["grounded"] += 1
    print(f"grades={len(grades)} subjects={len(subjects)} units={len(units)} "
          f"objectives={len(objectives)} keyTerms={len(key_terms)}")
    for b, v in sorted(by_board.items()):
        print(f"  {b}: {v['subjects']} subjects ({v['grounded']} with a real topic list)")
    print(f"-> {out}")


if __name__ == "__main__":
    main()
