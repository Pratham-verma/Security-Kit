// securitykit website: landing page (/), hosted app (/app, static, copied in by scripts/prepare.mjs)
// and documentation (/docs, Starlight). Everything is static; there is no server code.
import starlight from '@astrojs/starlight';
import { loadBundledKnowledgeBase } from '@seckit/core/browser';
import { defineConfig } from 'astro/config';

// One sidebar group per knowledge-base component, in the same order as the app.
const controlGroups = [...loadBundledKnowledgeBase().components.values()].map((c) => ({
  label: c.name,
  collapsed: true,
  items: [{ autogenerate: { directory: `docs/controls/${c.id.replace(/_/g, '-')}` } }],
}));

export default defineConfig({
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'never' },
  integrations: [
    starlight({
      title: 'Security Kit',
      description: 'Describe your app, get the security it needs: a tailored checklist and AI prompt mapped to OWASP ASVS, MASVS, Top 10, PCI DSS and CWE.',
      logo: { src: './src/assets/logo.svg', replacesTitle: false },
      favicon: '/favicon.svg',
      customCss: ['./src/styles/starlight.css'],
      components: {
        // The site is white and green only: no theme switcher, always light.
        ThemeSelect: './src/components/Empty.astro',
        ThemeProvider: './src/components/LightTheme.astro',
      },
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'What is Security Kit?', slug: 'docs' },
            { label: 'Use it in your browser', slug: 'docs/getting-started/web' },
            { label: 'Install the CLI', slug: 'docs/getting-started/cli' },
            { label: 'Run it with Docker', slug: 'docs/getting-started/docker' },
          ],
        },
        { label: 'Guides', items: [{ autogenerate: { directory: 'docs/guides' } }] },
        { label: 'Reference', items: [{ autogenerate: { directory: 'docs/reference' } }] },
        {
          label: 'Security controls',
          items: [
            { label: 'All controls', slug: 'docs/controls' },
            { label: 'By standard', slug: 'docs/controls/standards' },
            ...controlGroups,
          ],
        },
        { label: 'Project', items: [{ autogenerate: { directory: 'docs/project' } }] },
      ],
    }),
  ],
});
