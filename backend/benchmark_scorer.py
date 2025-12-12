"""
Benchmark scoring engine for RAG system validation.
Validates responses against expected content, citations, quotes, and policy behavior.
"""

import json
import re
from typing import Dict, Any, List, Optional
from pathlib import Path
from datetime import datetime


class BenchmarkScorer:
    """Score RAG responses against benchmark expectations"""

    def __init__(self):
        self.max_score_per_test = 7  # content(2) + citations(2) + quotes(1) + policy(1) + math(1)

    def score_response(self, test: Dict[str, Any], response: Dict[str, Any]) -> Dict[str, Any]:
        """
        Score a single test response against expectations.

        Args:
            test: Test case with question, must_include, must_cite, etc.
            response: RAG response with answer, sources, json, etc.

        Returns:
            Scoring result with points, max_points, passed, breakdown, and feedback
        """
        # Extract response data
        answer_text = response.get("answer", "")

        result = {
            "test_id": test["id"],
            "question": test["question"],
            "answer": answer_text,  # Include the actual answer
            "timestamp": datetime.utcnow().isoformat(),
            "scores": {},
            "total_score": 0,
            "max_score": 7,
            "passed": False,
            "feedback": []
        }
        quotes = response.get("json", {}).get("quotes", [])
        used_docs = response.get("json", {}).get("used_documents", [])
        policy_flags = response.get("json", {}).get("policy_flags", [])

        # 1. Content Match (0-2 points)
        content_score = self._score_content(
            answer_text,
            test.get("must_include", []),
            test.get("must_exclude", [])
        )
        result["scores"]["content"] = content_score
        result["total_score"] += content_score["points"]

        # 2. Citations (0-2 points)
        citation_score = self._score_citations(
            quotes,
            used_docs,
            test.get("must_cite", [])
        )
        result["scores"]["citations"] = citation_score
        result["total_score"] += citation_score["points"]

        # 3. Quotes (0-1 point)
        quote_score = self._score_quotes(
            quotes,
            test.get("policy_expect", {})
        )
        result["scores"]["quotes"] = quote_score
        result["total_score"] += quote_score["points"]

        # 4. Policy Behavior (0-1 point)
        policy_score = self._score_policy(
            policy_flags,
            answer_text,
            test.get("policy_expect", {})
        )
        result["scores"]["policy"] = policy_score
        result["total_score"] += policy_score["points"]

        # 5. Math Check (0-1 point, if applicable)
        math_check = test.get("policy_expect", {}).get("math_check")
        if math_check:
            math_score = self._score_math(answer_text, math_check)
            result["scores"]["math"] = math_score
            result["total_score"] += math_score["points"]

        # Pass/fail: 5+ points out of 7 is passing (71%+)
        result["passed"] = result["total_score"] >= 5

        # Collect all feedback
        for category_scores in result["scores"].values():
            result["feedback"].extend(category_scores.get("feedback", []))

        return result

    def _score_content(self, answer: str, must_include: List[str], must_exclude: List[str]) -> Dict[str, Any]:
        """Score content matching (2 points max)"""
        answer_lower = answer.lower()

        included = [term for term in must_include if term.lower() in answer_lower]
        excluded = [term for term in must_exclude if term.lower() in answer_lower]

        inclusion_rate = len(included) / len(must_include) if must_include else 1.0

        feedback = []

        if excluded:
            points = 0
            feedback.append(f"❌ Contains prohibited terms: {', '.join(excluded)}")
        elif inclusion_rate >= 1.0:
            points = 2
            feedback.append(f"✅ All required terms present ({len(included)}/{len(must_include)})")
        elif inclusion_rate >= 0.5:
            points = 1
            missing = [t for t in must_include if t not in included]
            feedback.append(f"⚠️  Partial match ({len(included)}/{len(must_include)}). Missing: {', '.join(missing)}")
        else:
            points = 0
            missing = [t for t in must_include if t not in included]
            feedback.append(f"❌ Poor match ({len(included)}/{len(must_include)}). Missing: {', '.join(missing)}")

        return {
            "points": points,
            "max_points": 2,
            "included": included,
            "excluded": excluded,
            "inclusion_rate": round(inclusion_rate, 2),
            "feedback": feedback
        }

    def _score_citations(self, quotes: List[Dict], used_docs: List, must_cite: List[str]) -> Dict[str, Any]:
        """Score citation completeness (2 points max)"""
        if not must_cite:
            return {"points": 2, "max_points": 2, "feedback": ["✅ No citations required"]}

        # Extract all cited filenames
        cited_files = set()
        for quote in quotes:
            source = quote.get("source", "")
            if source:
                cited_files.add(source)

        for doc in used_docs:
            # Handle both dict and string formats
            if isinstance(doc, dict):
                source = doc.get("source", "") or doc.get("filename", "")
            elif isinstance(doc, str):
                source = doc
            else:
                source = ""

            if source:
                cited_files.add(source)

        # Check which required files are cited
        cited_required = [f for f in must_cite if any(f in cited for cited in cited_files)]
        missing = [f for f in must_cite if f not in cited_required]

        citation_rate = len(cited_required) / len(must_cite)

        feedback = []
        if citation_rate >= 1.0:
            points = 2
            feedback.append(f"✅ All required documents cited ({len(cited_required)}/{len(must_cite)})")
        elif citation_rate >= 0.5:
            points = 1
            feedback.append(f"⚠️  Partial citations ({len(cited_required)}/{len(must_cite)}). Missing: {', '.join(missing)}")
        else:
            points = 0
            feedback.append(f"❌ Poor citations ({len(cited_required)}/{len(must_cite)}). Missing: {', '.join(missing)}")

        return {
            "points": points,
            "max_points": 2,
            "cited": list(cited_files),
            "cited_required": cited_required,
            "missing": missing,
            "citation_rate": round(citation_rate, 2),
            "feedback": feedback
        }

    def _score_quotes(self, quotes: List[Dict], policy_expect: Dict[str, Any]) -> Dict[str, Any]:
        """Score quote quantity (1 point max)"""
        quotes_min = policy_expect.get("quotes_min", 0)
        quotes_max = policy_expect.get("quotes_max", None)  # None means no upper limit

        quote_count = len(quotes)

        feedback = []
        # Check if count is within range
        min_satisfied = quote_count >= quotes_min
        max_satisfied = quotes_max is None or quote_count <= quotes_max

        if min_satisfied and max_satisfied:
            points = 1
            if quotes_min > 0 and quotes_max is not None:
                feedback.append(f"✅ Appropriate quote count: {quote_count} (expected {quotes_min}-{quotes_max})")
            elif quotes_min > 0:
                feedback.append(f"✅ Appropriate quote count: {quote_count} (minimum {quotes_min})")
            else:
                feedback.append(f"✅ Quote count acceptable: {quote_count}")
        else:
            points = 0
            if quote_count < quotes_min:
                feedback.append(f"❌ Too few quotes: {quote_count} (minimum {quotes_min})")
            elif quotes_max is not None:
                feedback.append(f"❌ Too many quotes: {quote_count} (maximum {quotes_max})")

        return {
            "points": points,
            "max_points": 1,
            "count": quote_count,
            "expected_min": quotes_min,
            "expected_max": quotes_max if quotes_max is not None else "unlimited",
            "feedback": feedback
        }

    def _score_policy(self, policy_flags: List[str], answer: str, policy_expect: Dict[str, Any]) -> Dict[str, Any]:
        """Score policy behavior (1 point max)"""
        flags_present = policy_expect.get("flags_present", [])
        flags_absent = policy_expect.get("flags_absent", [])
        must_answer = policy_expect.get("must_answer")

        feedback = []
        violations = []

        # Check flags that must be present
        for flag in flags_present:
            if flag not in policy_flags:
                violations.append(f"Missing expected flag: {flag}")

        # Check flags that must be absent
        for flag in flags_absent:
            if flag in policy_flags:
                violations.append(f"Unexpected flag present: {flag}")

        # Check answer type if specified
        if must_answer:
            if must_answer not in answer.lower():
                violations.append(f"Answer should contain: {must_answer}")

        if not violations:
            points = 1
            if flags_present or flags_absent or must_answer:
                feedback.append(f"✅ Policy behavior correct (flags: {', '.join(policy_flags) or 'none'})")
            else:
                feedback.append("✅ No policy requirements")
        else:
            points = 0
            for v in violations:
                feedback.append(f"❌ {v}")

        return {
            "points": points,
            "max_points": 1,
            "flags": policy_flags,
            "violations": violations,
            "feedback": feedback
        }

    def _score_math(self, answer: str, math_check: Dict[str, Any]) -> Dict[str, Any]:
        """Score mathematical computation (1 point max)"""
        expected = math_check.get("expected")

        # Find numbers in answer (supports formats like "SAR 12,450" or "12450" or "12,450")
        numbers = re.findall(r'[\d,]+\.?\d*', answer)

        # Parse numbers safely, filtering out any invalid strings
        parsed_numbers = []
        for n in numbers:
            try:
                parsed_numbers.append(float(n.replace(',', '')))
            except ValueError:
                pass
        numbers = parsed_numbers

        feedback = []
        if expected in numbers:
            points = 1
            feedback.append(f"✅ Correct calculation: {expected}")
        else:
            points = 0
            feedback.append(f"❌ Expected {expected}, found: {numbers}")

        return {
            "points": points,
            "max_points": 1,
            "expected": expected,
            "found": numbers,
            "feedback": feedback
        }

    def score_suite(self, tests: List[Dict[str, Any]], responses: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Score an entire benchmark suite.

        Returns:
            Summary with overall score, pass rate, and individual results
        """
        results = []
        total_score = 0
        total_max = 0
        passed_count = 0

        for test, response in zip(tests, responses):
            result = self.score_response(test, response)
            results.append(result)
            total_score += result["total_score"]
            total_max += result["max_score"]
            if result["passed"]:
                passed_count += 1

        pass_rate = (passed_count / len(tests)) * 100 if tests else 0
        overall_score = (total_score / total_max) * 100 if total_max else 0

        return {
            "summary": {
                "total_tests": len(tests),
                "passed": passed_count,
                "failed": len(tests) - passed_count,
                "pass_rate": round(pass_rate, 1),
                "total_score": total_score,
                "total_max": total_max,
                "overall_score": round(overall_score, 1),
                "grade": self._get_grade(overall_score)
            },
            "results": results,
            "timestamp": datetime.utcnow().isoformat()
        }

    def _get_grade(self, score: float) -> str:
        """Convert score to letter grade"""
        if score >= 90:
            return "A"
        elif score >= 80:
            return "B"
        elif score >= 70:
            return "C"
        elif score >= 60:
            return "D"
        else:
            return "F"


def load_benchmark_jsonl(filepath: str) -> List[Dict[str, Any]]:
    """Load benchmark tests from JSONL file"""
    tests = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                tests.append(json.loads(line))
    return tests


def save_benchmark_results(results: Dict[str, Any], output_path: str):
    """Save benchmark results to JSON file"""
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
