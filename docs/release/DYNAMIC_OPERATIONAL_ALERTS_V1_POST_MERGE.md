# Post-merge correction

PR #95 was merged while controlled production QA was still running. QA found one hardening requirement: explicitly reject null auth in the SECURITY DEFINER publisher. Production was hardened immediately. A clean follow-up PR will sync that additive migration to main before product wiring.