# Social platform logo usage

Internal design and implementation guidance for GoodMarketing.

## Scope and boundaries

This guide applies **only to third-party social platform marks** used to identify Facebook, Instagram, WhatsApp, LinkedIn, TikTok, YouTube, X, and the Meta parent brand in GoodMarketing's interface and public pages.

It does not authorize adding platforms, changing availability, redesigning pages, or changing other kinds of logos.

| Logo category | Purpose | Boundary |
| --- | --- | --- |
| Social platform logos | Identify a channel, integration, or upcoming platform | Governed by this guide and the platform's official brand guidance. |
| GoodMarketing's own logo | Identify the GoodMarketing product | GoodMarketing will have its own distinct logo and brand system. This guide does not select, replace, restyle, or define that logo. Social marks must never substitute for it. |
| Customer-uploaded company logos | Represent the customer's company or campaign brand | Separate customer-owned assets. Do not apply platform-specific colors, backgrounds, cropping, dimensions, or replacement rules to these uploads. Preserve the uploaded original. |

Do not infer a logo's category from its filename or visual similarity. Use its explicitly assigned role and source. A customer upload remains a customer asset even if it resembles a social platform mark.

## Approved assets and sources

Reuse the approved local platform assets in `frontend/assets/brand/social/`. Consult that directory's README for asset provenance; verify the actual file and rendered result if the inventory is out of date. Do not silently replace an approved asset during a general styling cleanup.

Use official source artwork when a replacement is explicitly requested. Prefer a genuine vector asset when available; otherwise use a sufficiently detailed PNG. An SVG containing an embedded low-resolution bitmap does not improve image quality. Store assets locally rather than hotlinking temporary CDN addresses.

| Platform | Official reference |
| --- | --- |
| Facebook | [Facebook brand resources](https://www.meta.com/brand/resources/facebook/logo/) |
| Instagram | [Instagram brand resources](https://www.meta.com/brand/resources/instagram/instagram-brand/) |
| WhatsApp | [WhatsApp brand resources](https://www.meta.com/brand/resources/whatsapp/whatsapp-brand/) |
| LinkedIn | [LinkedIn [in] logo](https://brand.linkedin.com/in-logo) |
| TikTok | [TikTok developer design guidelines and asset packs](https://developers.tiktok.com/docs/en/getting-started-design-guidelines) |
| YouTube | [YouTube brand resources](https://brand.youtube/) |
| X | [X brand toolkit](https://about.x.com/en/who-we-are/brand-toolkit) |
| Meta | [Meta company brand resources](https://www.meta.com/brand/resources/meta/company-brand/) |

Official brand guidance governs permitted uses, colors, clear space, and minimum sizes. Internal visual approval does not establish permission from the trademark owner. Do not present an integration logo as evidence of partnership or endorsement.

## Rendering rules

- Preserve the complete approved silhouette, aspect ratio, lettering, and colors. Do not redraw marks, substitute text characters, or invent color variants.
- Inspect transparency and internal whitespace before adjusting CSS. White details that belong to the logo must remain white. For LinkedIn, white lettering must be part of the artwork; do not supply it with an added backing surface.
- Prefer an appropriate official transparent variant over removing an opaque background by hand. Do not erase backgrounds or trim canvas automatically. Any permitted canvas adjustment must preserve artwork and required clear space.
- Use centered `object-fit: contain` sizing. Do not stretch artwork, use `object-fit: cover`, or clip logos into generic circles or rounded masks.
- Match **visible artwork size** within a placement. Equal image-element dimensions do not ensure equal visual weight when source files contain different amounts of whitespace. Preserve wide marks such as YouTube's play button.
- Use an approved variant that remains legible against its background. Keep intentional backing surfaces only where approved for that platform. LinkedIn must have no added backing, white or otherwise.
- Keep glass, shadows, and decorative effects on surrounding interface elements where appropriate; do not apply effects that alter the logo itself.
- Provide adequate source detail for the rendered size and display density. Do not upscale small rasters to simulate higher quality.

## LinkedIn: preserve the user-approved version

The approved shape reference is the SVG introduced in commit `a287e14e64d68a26969e1d48446cfbc6c2d8b02f`, titled **Replace LinkedIn mark with official vector**, at `frontend/assets/brand/social/linkedin.svg`. The user's latest approved appearance is the blue mark with white “in” lettering, with no added backing.

Its approved appearance is a blue square with white “in” lettering and no registration symbol. The blue square and white lettering are the logo artwork, not a backing. All space outside the logo's silhouette, including outside its rounded corners, must remain transparent. Do not add a white rectangle, colored backing, CSS background, or pseudo-element behind the image to fill its lettering. The image and any logo-specific wrapper must have transparent backgrounds; existing surrounding cards retain their own styling.

The historical SVG has transparent lettering and is a shape reference, not a reason to restore white CSS backing. The rendered asset must contain white lettering as part of the artwork while preserving the approved geometry, colors, square proportions, and corner shape. Do not let the dark page show through the lettering. Preserve the complete silhouette with no circular clipping, masks, filters, or distortion.

Reuse this approved appearance without added backing wherever LinkedIn is already required, including the landing hero, workflow upcoming-platform selector, Learn More platform group, and Coming Soon card. Context-specific sizing may differ; the artwork must not. This supersedes earlier instructions to use a solid white backing.

Do not substitute the older 240 × 220 PNG, add a registration symbol, or download another variant as part of cleanup. The historical reference identifies the approved artwork; it is not an instruction to revert entire commits or stylesheets. Replacing this approved design requires a separate explicit request.

## Placement and availability

- Use platform marks only where the relevant channel is identified. Do not add every platform to every page automatically.
- Keep active integrations distinct from upcoming platforms. A logo does not mean an integration is connected or available.
- Preserve existing disabled states and availability wording. Do not add upcoming platforms to connected-account or active-publishing previews during a logo correction.
- On Learn More, keep upcoming non-Meta platforms separate from the Meta group. Meta is the parent brand of Facebook, Instagram, and WhatsApp; its logo does not represent the other platforms.
- Retain platform names and accessible labels. Use empty image alt text when an adjacent label already supplies the same name; provide an accessible name when the logo conveys that information alone. Preserve English and Spanish interface labels while keeping brand names intact.

## CSS and asset isolation

Target a platform-specific component or explicit platform identity, such as a LinkedIn-specific class within a platform-logo component. Avoid broad selectors such as `img`, `.logo`, or rules targeting every image whose filename includes “logo.”

Platform-logo rules must not affect GoodMarketing's product mark, customer-uploaded logos, campaign artwork, avatars, or unrelated illustrations. Separate those asset roles and styling hooks even when they share a page or storage service.

Do not overwrite a shared asset if doing so changes dashboard or workspace routes outside the requested scope. Use a scoped reference or asset where necessary. Preserve customer originals and existing product-brand assets.

## Verification and change limits

For a logo correction, change only the requested asset references and the smallest necessary rendering rules. Preserve other marks, layout, copy, navigation, animation behavior, functionality, and platform states unless explicitly requested otherwise.

Before considering the change complete:

1. Inspect the rendered logo in every affected placement, including hidden workflow states and animated hero positions.
2. Compare desktop and mobile screenshots for complete silhouettes, correct lettering, contrast, balanced visible size, and no clipping or distortion. Image loading alone is insufficient.
3. Confirm that GoodMarketing's own logo and customer-uploaded company logos are unaffected.
4. Review the diff for unintended changes and record asset provenance if an asset changed.

This document is guidance only. Adding it does not authorize implementation changes or deployment.
