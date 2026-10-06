# Sound and touch

The decision record for Tidefern's interface sound, built in task G7 on
the decisions in `docs/ARCHITECTURE.md` section 14.1. The chapter at
`/design/sound` plays every cue; this file says what was decided, what
the code checks and what still needs a person with real phones.

## What exists

| Piece                     | Where                                        | What it does                                                                                                                                           |
| ------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Synthesis and cue specs   | `apps/web/src/lib/sound.ts`                  | One shared `AudioContext`, a master bus, six cues described as data (`cueSpec`) with every pitch and level read from `tokens.json`                     |
| Envelope math             | `envelopeGainAt`, `toneLength`, `cueLength`  | The same curve the audio graph schedules: exponential rise from a positive floor, `setTargetAtTime` decay with a time constant of a third of the decay |
| Quiet hours               | `apps/web/src/lib/quiet-hours.ts`            | Pure window math in minutes of the day, start inclusive and end exclusive, crossing midnight when the end is before the start                          |
| Delegation and settle cue | `apps/web/src/components/sound-provider.tsx` | Hover, press and the settle cue for every control, with no opt-in                                                                                      |
| Chapter                   | `/design/sound`                              | Each cue playable, its envelope drawn, the live context state, a level meter, the real mute and level controls, the haptic patterns                    |
| Setting                   | `/settings/sound`                            | The three levels, quiet hours with a start and an end, and "Play a sample"                                                                             |

## Decisions made in G7

- **Cues are data.** Each cue is a list of tones (wave, pitch, optional end
  pitch, attack, decay, peak, delay). `play()` schedules exactly that list,
  and the chapter prints and draws the same list, so a number on the page
  cannot drift from the sound.
- **`play()` says why it stayed silent.** It returns `played`, `off`,
  `quiet`, `locked`, `hover-level` or `hover-gap`. The chapter and the
  sample button print that in words, because sound never carries meaning
  alone.
- **The settle cue is a link's.** A plain click or Enter on an `a[href]`
  to another page of this app arms a 600 ms window for that link's path;
  the cue plays once if the route changes to that path inside it, one task
  after the new view commits. A button never arms it, so a redirect a form
  makes after its request is silent. A route that lands anywhere but the
  link's own path is a redirect (a signed-out tap on `/settings/sound`
  that the server sends to `/sign-in`) and is silent too, as architecture
  14.1 lists redirects among the silent cases. A click with Ctrl, Cmd,
  Shift or Alt, a middle click, a `target` other than `_self`, a
  `download` link, another origin and a same-page `#hash` link never arm
  it, because none of them changes the current tab's page. `popstate`
  clears the arm, so back and forward are silent; a reload or a fresh load
  is a first render, which never plays. A view that takes longer than
  600 ms gets no cue rather than a late one.
- **The settle cue's sound.** One sine at `sound-success-hz-a` (523.25 Hz,
  the success cue's first note) at `sound-hover-gain` (0.05, about
  -36.5 dBFS after the bus), with a 12 ms attack and a 140 ms decay. It
  borrows the success pitch so it belongs to the same family, and it sits
  at the hover level, the quietest in the set, because the press cue of
  the same click has already sounded and the settle only confirms that the
  view arrived. The slower attack than the 6 ms of the action cues and the
  pure sine keep it soft and keep it from reading as a second click. Like
  every other number, the listening pass may move it.
- **Quiet hours silence every cue**, the settle cue included, and win over
  the level. They are an `HH:MM` start and end stored on the device under
  `tidefern-quiet-hours-v1` beside `tidefern-sound-v1`, read through the
  device clock until task E2 gives the profile a time zone. Equal start
  and end means no window. Another tab's change reaches the provider
  through the `storage` event. The sentences that say whether it is quiet
  right now print the times in the browser's locale, the form the native
  time fields show ("10:00 PM" or "22:00"), and one timer re-renders them
  at the next start or end, so a page left open never shows a stale
  sentence. `play()` reads the clock on every call either way.
- **A demo button owns its cue.** An element with `data-cue` plays its own
  cue from its click handler; the provider still unlocks on it but skips
  the press cue, so one press does not sound twice.
- **The meter samples only while a cue sounds.** An analyser after the
  master gain is read on animation frames from the moment a cue is
  scheduled until 120 ms after its last tone stops, then the loop ends.
  Nothing runs between cues.

## Levels as built

Master bus 0.3. Output peaks after the bus: hover tick about -36.5 dBFS,
press, toggle, error and the first success note about -29.6 dBFS, settle
about -36.5 dBFS. The unit tests keep the action cues inside the -20 to
-33 dBFS band the research verified.

## What the tests protect

- `apps/web/src/lib/sound.test.ts`: the envelope starts at the floor,
  reaches the peak at the end of the attack, rises exponentially, decays
  with a time constant of a third of the decay and is under a hundredth
  of the peak when the oscillator stops; every cue lasts under a second;
  every pitch and level comes from the tokens; the level and quiet hours
  round trip through storage; `play()` creates nothing outside a browser.
- `apps/web/src/lib/quiet-hours.test.ts`: windows inside one day and
  across midnight, the boundaries, the empty window, malformed storage,
  the locale form of a time and the delay to the next start or end.
- `apps/web/src/components/sound-provider.test.tsx`: delegation, the
  owned cue, and the settle cue on a link click or Enter inside 600 ms,
  never on a first render, a button press, back or forward, after the
  window, a server redirect elsewhere, a modifier or middle click, or a
  new-tab, download, other-origin or same-page link.
- `apps/web/tests/e2e/sound.spec.ts`: no `AudioContext` before a gesture
  (counted through a hook installed before navigation), a cue after a
  click, the mute and the middle level surviving a reload, quiet hours
  silencing a cue on the chapter and on the setting, the settle cue after
  Enter on a link and not after back, and axe in both themes on both
  routes.

## Listening pass (not yet done)

Architecture 14.2 asks for a listening pass on a real iPhone and a
mid-range Android before the master gain is frozen. It needs the owner's
phones and has not been done. On each phone, open `/design/sound` on the
preview deployment and record the result here.

- [ ] iPhone, Safari, Ring/Silent switch on ring: every cue is audible
      and none clicks at its start or end.
- [ ] iPhone, Ring/Silent switch on silent: nothing plays (Web Audio on
      the ambient session).
- [ ] iPhone: background the tab, come back, tap once: the state reads
      `running` again and the next cue plays.
- [ ] iPhone: the first tap on a fresh page unlocks and the press cue
      plays on that tap or the next one.
- [ ] Android, Chrome: every cue is audible and none clicks.
- [ ] Android: each haptic button vibrates and the tap pattern is felt on
      a press.
- [ ] Both: the hover tick never plays on touch.
- [ ] Both: the master gain of 0.3 sits under the system's own click
      sounds at a normal media volume; note the volume used.
- [ ] Both: the settle cue after tapping a chapter link feels attached to
      the tap, not late, and is quieter than the press cue it follows
      without being lost under it.
- [ ] Both: quiet hours set around the current time silence the sample.

## Open

- `/privacy` lists `tidefern-sound-v1` but not yet
  `tidefern-quiet-hours-v1`; the privacy page belongs to another task.
- Task E2 moves the level and quiet hours onto the profile and gives quiet
  hours the profile's time zone.
- The Settings shell has no navigation entry for Sound until task H7
  builds the full `/settings` route.
