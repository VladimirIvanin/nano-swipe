export async function freezeClock(page) {
  // install() alone keeps advancing with wall time between test commands.
  // Pause before mounting so exact interval assertions remain deterministic.
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
}
