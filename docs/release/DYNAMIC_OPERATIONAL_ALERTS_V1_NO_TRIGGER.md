# No implicit edit trigger

V1 deliberately does not attach generic UPDATE triggers to journey/transport tables. This prevents harmless administrative edits from becoming traveler-facing alerts. Publication is an explicit governed action.