# ADR-001: KES-only money and bigint minor units

Status: Accepted.

All money is KES and is represented as bigint minor units. Floating-point
arithmetic is prohibited; conversion and division use the single domain
rounding function documented by `Money`.
