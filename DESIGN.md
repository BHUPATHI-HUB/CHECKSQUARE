# CheckSquare: professional inspection workspace

## Design contract

Mode: Operate for authenticated screens; Persuade for home; Read for policy pages.
The work is recording property evidence, reviewing reports, coordinating appointments
and retrieving documents. The next action, property identity and report status take
priority over decoration. Preserve routes, permissions, branding settings and storage.

Use restrained glassmorphism as requested: translucent mineral-tinted surfaces,
fine highlight borders, frosted navigation and overlays, dark teal actions, readable
neutral text, compact sans-serif headings and tabular numbers. Retain configured
brand colors and readable foregrounds. Keep form fields and evidence opaque; glass
must not put dense records over photographs. Material-style affordances remain;
neumorphic controls are excluded because their boundaries are weak for field use.
Limit backdrop blur to navigation and open overlays rather than every record card.
Provide opaque fallbacks for unsupported browsers and reduced transparency/contrast
preferences. Do not animate blur or use continuous decorative animation.

Shared controls own focus, disabled, invalid, hover and pressed states. Dialogs must
fit the dynamic viewport, scroll internally and retain Radix keyboard/focus behavior.
Loading states reserve content space and announce progress. Empty states describe
the next action; failures must not pretend to be empty successful results.

Desktop: compact page heading, visible primary action, grouped filters and records.
Mobile: one column, wrapping actions, 44px primary targets, horizontally scrollable
tables/tabs, no clipped dialogs. Navigation collapses before links collide.
Motion is brief feedback, respects reduced motion, and never delays usable content.
No decorative looping animation in work areas, oversized editorial task headings,
low-contrast text on brand colors, or fabricated metrics.

## Evidence and verification

- https://www.nngroup.com/articles/flat-design-best-practices/ — retain clear affordances and subtle depth.
- https://www.nngroup.com/articles/animation-purpose-ux/ — brief, purposeful feedback.
- https://material-web.dev/components/elevation/ — surface separation through elevation.

The bundled anti-ui-slop reference scripts are absent; the user authorized a manual
workflow. Verify all routes and shared interactions at desktop/mobile sizes; report
real backend tests separately from fixtures and unavailable services.
