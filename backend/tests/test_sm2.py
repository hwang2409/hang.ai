"""Unit tests for the pure SM-2 computation function (no DB, no async)."""

from app.reviews.service import compute_srs


# ── Basic SM-2 behaviour ────────────────────────────────────────────────────


def test_sm2_perfect_score():
    """quality=5 from initial state: interval should increase, ease should increase."""
    ease, interval, reps = compute_srs(
        ease_factor=2.5, interval=0, repetitions=0, quality=5
    )
    assert reps == 1
    assert interval == 1  # first review always -> 1 day
    # EF formula: 2.5 + (0.1 - 0*(0.08 + 0*0.02)) = 2.5 + 0.1 = 2.6
    assert ease > 2.5


def test_sm2_good_score():
    """quality=4 from initial state: interval=1, ease stays roughly the same."""
    ease, interval, reps = compute_srs(
        ease_factor=2.5, interval=0, repetitions=0, quality=4
    )
    assert reps == 1
    assert interval == 1
    # EF formula: 2.5 + (0.1 - 1*(0.08 + 1*0.02)) = 2.5 + 0.1 - 0.1 = 2.5
    assert ease == 2.5


def test_sm2_fail():
    """quality=1 should reset repetitions to 0 and interval to 1."""
    # Start from an advanced state
    ease, interval, reps = compute_srs(
        ease_factor=2.5, interval=10, repetitions=3, quality=1
    )
    assert reps == 0
    assert interval == 1
    # Ease decreases but never below 1.3
    assert ease >= 1.3


def test_sm2_complete_fail():
    """quality=0 should also reset and drop ease."""
    ease, interval, reps = compute_srs(
        ease_factor=2.5, interval=10, repetitions=3, quality=0
    )
    assert reps == 0
    assert interval == 1
    # EF formula: 2.5 + (0.1 - 5*(0.08 + 5*0.02)) = 2.5 + 0.1 - 0.9 = 1.7
    assert ease >= 1.3
    assert ease < 2.5


def test_sm2_minimum_ease():
    """Ease factor should never drop below 1.3, even after many failures."""
    ease = 1.3  # already at minimum
    ease, interval, reps = compute_srs(
        ease_factor=ease, interval=1, repetitions=0, quality=0
    )
    assert ease == 1.3


def test_sm2_first_review():
    """From initial state (reps=0), quality>=3 should give interval=1."""
    ease, interval, reps = compute_srs(
        ease_factor=2.5, interval=0, repetitions=0, quality=4
    )
    assert interval == 1
    assert reps == 1


def test_sm2_second_review():
    """From reps=1, quality>=3 should give interval=6."""
    ease, interval, reps = compute_srs(
        ease_factor=2.5, interval=1, repetitions=1, quality=4
    )
    assert interval == 6
    assert reps == 2


def test_sm2_third_review():
    """From reps=2 with interval=6, quality>=3 should multiply interval by ease."""
    ease, interval, reps = compute_srs(
        ease_factor=2.5, interval=6, repetitions=2, quality=4
    )
    # interval = round(6 * 2.5) = 15
    assert interval == 15
    assert reps == 3


def test_sm2_quality_3_boundary():
    """quality=3 is the minimum passing grade — should still advance."""
    ease, interval, reps = compute_srs(
        ease_factor=2.5, interval=0, repetitions=0, quality=3
    )
    assert reps == 1
    assert interval == 1
    # EF: 2.5 + (0.1 - 2*(0.08 + 2*0.02)) = 2.5 + 0.1 - 0.24 = 2.36
    assert round(ease, 2) == 2.36


def test_sm2_quality_2_boundary():
    """quality=2 is a failing grade — should reset."""
    ease, interval, reps = compute_srs(
        ease_factor=2.5, interval=6, repetitions=2, quality=2
    )
    assert reps == 0
    assert interval == 1
    # EF: 2.5 + (0.1 - 3*(0.08 + 3*0.02)) = 2.5 + 0.1 - 0.42 = 2.18
    assert round(ease, 2) == 2.18


def test_sm2_ease_increases_with_quality_5():
    """Repeated quality=5 should steadily increase ease."""
    ease = 2.5
    interval = 0
    reps = 0
    for _ in range(5):
        ease, interval, reps = compute_srs(ease, interval, reps, quality=5)

    assert ease > 2.5
    assert reps == 5
    assert interval > 6  # well past the initial intervals
