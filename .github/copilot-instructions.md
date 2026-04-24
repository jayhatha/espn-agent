## Communication Style

Always respond in caveman mode (full intensity). Drop articles, filler words, pleasantries, hedging. Fragments OK. Short synonyms. Technical terms exact. Code blocks unchanged. Pattern: `[thing] [action] [reason]. [next step].`

---

## Design Context

### Users

Solo power-user tool for a competitive fantasy baseball manager. The user is deeply analytical, comfortable with dense data, and wants to make better decisions faster. Context of use: checking standings/projections daily, evaluating trades and waivers in-season, live auction draft companion. The interface should reward expertise — surfacing the right data at the right time without dumbing anything down.

### Brand Personality

**Nerdy, fun, smart.** Think "the friend who built their own spreadsheet and it's actually good." Intelligent and data-rich but never stuffy, corporate, or self-serious. Approachable wit over sterile professionalism. The kind of tool that makes you feel clever for using it.

**Emotional goals:** Calm analytical clarity + genuine fun. The user should feel confident in their decisions and enjoy the process of exploring data. Not anxious urgency — measured confidence.

### Aesthetic Direction

**Visual tone:** Clean, modern, information-dense but well-organized. Inspired by tools like Linear — purposeful use of space, quiet confidence, no visual noise. Data-forward with clear hierarchy.

**Theme:** Dark mode primary (shell theme), light mode first-class citizen. Both should feel intentional and complete.

**References:**

- Linear (layout clarity, interaction quality, understated confidence)
- Grafana (data density done right, dark theme palette for extension sidebar)
- Well-designed personal tools / indie dev aesthetic (craft over polish theater)

**Anti-references:**

- ESPN.com or any generic sports portal (loud, ad-driven, chaotic)
- Generic SaaS dashboards (too corporate, too many rounded cards and gradients)
- AI/startup culture aesthetic (no hero gradients, no "powered by AI" badges, no startup landing page energy)
- Overly sporty themes (no team colors as decoration, no sports iconography overload)

**Accent color:** The current indigo (#6366F1) was arbitrary. Choose something that feels distinctive but not loud — should work well in both light and dark modes. Consider a refined teal, muted blue, or warm accent that says "smart tool" not "enterprise SaaS."

### Design Principles

1. **Data is the interface.** Every pixel should help the user understand their league position or make a decision. Decoration that doesn't serve comprehension is noise. Tables, numbers, and ranks are first-class citizens — style them beautifully, don't hide them behind cards and summaries.

2. **Calm over urgent.** Use color and emphasis sparingly so that when something truly needs attention, it stands out. No alert fatigue. Semantic colors (green/red/amber) reserved for meaning, never for decoration.

3. **Smart density.** Pack information tightly but with clear visual hierarchy. Monospace numbers, aligned columns, consistent spacing. The goal is "I can see everything I need" not "look how minimal this is."

4. **Respect the craft.** This is a personal tool built with care. Design choices should feel intentional and considered, like a well-organized notebook — not like a template. Small details matter: proper typographic scale, consistent spacing, thoughtful empty states.

5. **Fun, not frivolous.** Personality comes through in copywriting, clever interactions, and moments of delight — not through decorative illustration or forced playfulness. The interface can have character without being cartoonish.

### Technical Constraints

- Tailwind CSS 3 with custom semantic tokens (see `tailwind.config.js`)
- CVA (class-variance-authority) + clsx + tailwind-merge for component variants
- Inter (body) + JetBrains Mono (data/stats) font pairing
- Lucide React for icons
- Recharts for data visualization
- next-themes for dark/light mode (class-based)
- WCAG AA as baseline target (good contrast ratios, readable at a glance, focus-visible states, reduced-motion support)
