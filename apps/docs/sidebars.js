/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
module.exports = {
  tutorialSidebar: [
    {
      type: 'doc',
      id: 'intro',
      label: 'Introduction',
    },
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'getting-started/installation',
        'getting-started/quickstart',
        'getting-started/basic-routes',
      ],
    },
    {
      type: 'category',
      label: 'Core Concepts',
      items: [
        'core-concepts/input-validation',
        'core-concepts/output-validation',
        'core-concepts/error-handling',
        'core-concepts/custom-context',
        'core-concepts/middleware',
        'core-concepts/reusable-procedures',
        'core-concepts/combining-routers',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/better-auth-integration',
        'guides/protected-routes',
        'guides/cors-configuration',
        'guides/client-side-usage',
      ],
    },
  ],
};

