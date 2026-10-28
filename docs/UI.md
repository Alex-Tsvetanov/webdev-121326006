# UI checklist

<!-- Exercise 4 hands this in. Tick an item only when you have checked it, and replace
     the "how I checked" line with what you actually did. An unticked box is not a
     failure: it is a gap you then write into READINESS.md. A ticked box you cannot
     demonstrate at the defence is worse than an unticked one. -->

"Modern" is not a style. It is a short list of things a user notices when they are
missing: the screen tells you what is happening, you can get through it with a keyboard,
the text is readable, and nothing jumps around while it loads.

Checked in the built-in browser against the app on `http://localhost:3100` with a local
Postgres 16, on 2026-10-28. Viewports were set with the browser tool; no real phone was used.

## Layout and typography

- [x] **One spacing scale and one type scale.** Sizes come from a small set of design tokens, not from numbers typed where they were needed.
  - how I checked: colours, spacing, radius and font sizes are tokens in `:root` (`public/styles.css`). The font sizes were literals until this check; they are now `--font-size-lg` and `--font-size-xl`. Literals still left: 1px borders, the 1100px content width, the 768px and 1280px breakpoints, and the 3px focus outline.
- [x] **Responsive at 380, 768 and 1280 pixels wide.** No horizontal scrollbar, no text running under another element.
  - how I checked: `document.documentElement.scrollWidth` equalled the viewport width at 380, 768 and 1280 px. The 380 px layout is one column and the 768 px layout is two. I looked at screenshots at 380 and 768 px and saw no text overlapping another element; 1280 px was measured but not looked at closely.
- [ ] **Nothing jumps while the page loads.** Images and cards reserve their space before their content arrives.
  - how I checked: not checked yet. The loading text appears in place, but I did not measure layout shift when the lists fill in.

## The four states, on every screen

A screen that only handles "it worked" is a screen that lies to the user on the day it matters.

- [x] **Loading.** Something tells the user the app is working, within about 100 ms.
  - how I checked: with the network slowed by 2.5 s in the browser, the page showed "Loading labs…" and "Loading your reservations…" while the requests were pending. I did not measure the 100 ms figure, and I did not capture this as a screenshot.
- [x] **Empty.** The screen says what this list is for and what to do next, instead of showing nothing.
  - how I checked: a new account shows "You have no reservations yet." under "My reservations". The labs list is never empty in the seed data, so its empty text ("No labs have been added yet.") is only in the code.
- [x] **Error.** A sentence a person can read. Never a raw JSON body, never a stack trace, never just "Error".
  - how I checked: a booking that overlaps an existing one shows "This lab is already reserved for part of that time." The assistant with no API key shows "The AI assistant is not set up right now. Please fill in the form instead." Neither showed a raw body.
- [x] **Success.** The user can see that what they did took effect, without reloading the page to find out.
  - how I checked: after booking, "Lab reserved." appeared and the booking was in "My reservations" with its times and purpose, with no reload.

## Keyboard and accessibility

- [ ] **The main flow works with the keyboard alone.** Sign in, do the core action, sign out, without touching the mouse.
  - how I checked: keyboard alone worked for the skip link, sign-in (Tab to the fields, type, Enter) and sign-out (Tab to the button, Enter). The core action, booking, was done with the mouse, so this item is not ticked.
- [x] **The focused element is visible.** A `:focus-visible` outline that is not switched off.
  - how I checked: the focused select had a computed `outline: solid 3px rgb(255, 176, 0)`, from `:focus-visible` in `styles.css`.
- [x] **Text contrast is at least 4.5:1.** Name the tool you measured with.
  - how I checked: computed colours from the browser, with the WCAG relative-luminance formula run in page script: body text 15.39:1, notice 14.37:1, error notice 6.24:1, primary button 6.09:1, ghost button 6.09:1. Placeholder text was not measured.
- [x] **Every input has a label** a screen reader reads, not just placeholder text.
  - how I checked: in the page, each of the seven form fields (email, password, description, lab, start, end, purpose) has an associated `<label>`.
- [x] **The page has a correct `<title>` and `lang`.**
  - how I checked: `lang="en"` and `<title>Lab Reservations</title>`, read from the page.
- [x] **Touch targets are at least 44 pixels.**
  - how I checked: first measurement at 380 px found buttons and inputs at 42 px and the lab select at 39 px. Added `--target-min: 2.75rem` to them. Re-measured at 380 px: no control under 44 px.

## The model feature

- [x] **It shows that it is thinking.** A model call is slow and a free service may have been asleep; a frozen button is the worst possible answer.
  - how I checked: "The assistant is thinking…" appeared immediately after pressing "Suggest with AI".
- [x] **It shows when it failed,** and the rest of the screen still works.
  - how I checked: with no API key the box shows "The AI assistant is not set up right now. Please fill in the form instead." Afterwards sign-out, keyboard sign-in and the reservation list still worked. The timeout and 429 messages are not seen on screen; they are covered by tests (AC-16, AC-17).
- [ ] **The user can tell the model's suggestion from a fact.** It is labelled as a suggestion, not presented as data the app knows.
  - how I checked: not checked on screen, because there is no API key here, so no suggestion was ever shown. The code text is "Suggested: … Check it, then reserve." (`public/app.js`); that is not evidence that it looks right.

## Decisions

- [x] **Dark mode, or a written decision not to have one.**
  - what I decided and why: no dark mode. The app has one palette, and I checked its contrast in light mode only. A dark palette would need its own contrast measurements, which I have not done. The assistant wrote this decision for the project; change it if you disagree.

## Evidence

<!-- Screenshots of at least the four states of one screen, and of the model feature
     thinking and failing. A link to them is enough; they do not have to be in the repo. -->

No screenshot files are saved in `docs/ui/`. The browser tool shows screenshots in the chat but cannot write files, so the evidence above is the page text, the DOM measurements and the computed styles. Save screenshots of the four states of one screen and of the assistant box, then link them here.
