# MYLIT Calendar Redesign Reference

Use this document as the visual reference because Claude Code is being used from terminal and cannot directly see the concept images.

## Overall goal

Redesign the Calendar page so it no longer feels like a plain week grid. It should feel like a pixel-art RPG schedule board.

The Calendar should have two main modes:

1. Week View
2. Day View

The Week View uses clickable day-card icons instead of a full weekly time grid.
The Day View shows a detailed hourly schedule for one selected day.

The design must remain consistent with MYLIT:
- dark fantasy/pixel background
- gold borders
- parchment/light brown cards
- red calendar top strips
- pixel-style typography
- RPG menu/card feeling
- mobile-first iPhone/PWA layout

---

# WEEK VIEW DESIGN

## Page header

At the top:
- Center the page title: CALENDAR
- Keep the existing MYLIT/pixel style.
- The title should be centered, not left-aligned.
- Apply this title-centering pattern to all main page titles across the app if a shared title/header system exists.

Subtitle example:
“Plan quests, habits, and recovery.”

Keep the top header visually close to the current MYLIT style: dark translucent panel, gold border, pixel font.

## Evie helper panel

Evie must still appear near the top of Calendar.

Use the current Evie avatar/card style if it exists.

The helper text can say something like:
“Calendar shows quests, habits, sleep guides, and recovery blocks. Tap any day to inspect it.”

Do not remove Evie.

## Week navigation

Below the header/Evie area, show:
- left arrow button
- centered “WEEK VIEW”
- centered week range, for example:
  “Jun 28 – Jul 4, 2026”
- right arrow button

The arrow buttons should still change weeks like the current calendar.

## Day-card row

Instead of a full week grid, show 7 clickable day cards/icons:
- SUN
- MON
- TUE
- WED
- THU
- FRI
- SAT

Each card should show:
- red strip/header at the top
- weekday label in the red/header area or immediately below it
- date below weekday, like `7/4`
- parchment/light brown card body
- pixel border/shadow
- small task preview rows
- `+n more` if there are more items than fit

The day card body should NOT be plain white.
Use a light brown/parchment color to fit the app theme.

Example card layout:

[red strip]
SUN
6/28
• Today Quest
• Sleep Guide
• Progress
+2 more

## Today highlight

The actual current day should:
- have a gold highlighted border
- have small text above the card that says:
  “Today”
- still be clickable

The selected day can also have a pointer/marker beneath it if helpful.

## Day previews

Each day card should show a few important items:
- Today Quest
- Weekly Habit
- Sleep Guide
- Progress quest
- Recovery quest
- Checklist/task item
- Holiday/all-day item if applicable

Do not show every item if there are too many.
Show a compact preview and then:
“+n more”

Keep previews readable on iPhone.

## Week View selected-day summary

Below the day-card row, show a selected-day panel.

It should show:
- selected day icon/card on the left, like WED 7/1
- heading like:
  “WEDNESDAY, JULY 1, 2026”
- short supportive line:
  “Midweek momentum. Stay on track.”
- summary cards:
  - Today Quest
  - Weekly Habit
  - Next Quest
  - Sleep Guide

Then show a compact “Schedule Preview” list:
- time
- item title
- category pill
- `+n more` if needed

## Open Day View button

Below the selected-day summary/schedule preview, show a large button:

“OPEN DAY VIEW”

Subtext:
“See full schedule for this day”

Clicking it switches to Day View for the selected day.

## Quests and Day Plan buttons

Below the “Open Day View” button, keep the existing Calendar shortcuts:

1. Quests
2. Day Plan

They should be below Open Day View, not above it.

They should keep MYLIT styling:
- dark panel
- gold border
- icon
- label
- short subtitle
- arrow

---

# DAY VIEW DESIGN

Day View is entered by tapping a day card or pressing Open Day View.

## Day View top

At the top, keep:
- centered Calendar title/header if applicable
- week day-card row still visible at the top if feasible
- current week navigation if feasible

Then show a Day View panel.

## Return button

Day View must have a clear button:

“RETURN TO WEEK VIEW”

Pressing it returns to Week View.

## Day View heading

Show:
- selected day icon/card, like WED 7/1
- heading:
  “WEDNESDAY, JULY 1”
- subtext:
  “Tap a task to view or edit details.”

## Hourly schedule

Show a vertical day schedule with time labels on the left:
- 7 AM
- 8 AM
- 9 AM
- 10 AM
- etc.

Use a dark schedule panel.
Use subtle horizontal time grid lines.
Keep it readable on iPhone.

## Task blocks

Scheduled items should appear at their correct time positions.

Task blocks should show:
- time range
- title
- optional subtitle/details
- category icon or color
- be clickable/tappable

Use category colors consistent with MYLIT:
- Sleep Guide: blue/teal
- Progress: brown/gold/orange
- Recovery: purple
- Weekly Habit: green
- Today Quest: yellow/gold
- Other/general task: blue or neutral

## Overlapping tasks

If tasks overlap:
- they must all remain visible
- they must all remain clickable
- they should share horizontal space side-by-side
- they should not completely cover each other
- they should not push unrelated later tasks far down
- no large empty gaps should be created

Example:
If one task is 10:00–11:00 and another is 10:30–11:15, they should appear in adjacent horizontal lanes within the same time area.

If a task starts exactly when another ends, it can appear directly after it.

## Day View footer note

Optional small note:
“Overlapping tasks share space so you can see them all.”

Bottom nav should remain usable and should not cover schedule content.

---

# FUNCTIONAL REQUIREMENTS

1. Week arrows still navigate weeks.
2. Day cards are clickable.
3. Clicking day card enters/selects Day View.
4. Return to Week View works.
5. Open Day View button works.
6. Quests and Day Plan buttons remain below Open Day View.
7. Calendar data is not reset.
8. Existing task categories still work.
9. Sleep guide, quests, checklist items, recovery blocks, weekly habits, and Today Quest still appear.
10. Task modals/details still work when tapping items.
11. Overlapping tasks remain visible and clickable.
12. iPhone/PWA layout remains clean.

---

# CENTERED TITLES ACROSS APP

Also center all main page titles across the app.

Do this through a shared page header/title component if one exists.
If there is no shared component, apply the smallest safe style changes to common page headers.

Do not redesign unrelated pages.
Only center page titles while preserving their existing style.

---

# VISUAL PRIORITY

Prioritize matching these details:
- Week View uses clickable parchment calendar day cards.
- Each card has a red top strip.
- Current day has gold border and “Today” above it.
- Day cards show task previews and +n more.
- Day View uses a dark timeline board with colored pixel task blocks.
- Overlapping tasks share horizontal space.
- Evie remains near top.
- Open Day View button appears above Quests and Day Plan buttons.
