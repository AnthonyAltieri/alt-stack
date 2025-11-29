/**
 * Creating a sidebar enables you to:
 * - create an ordered group of docs
 * - render a sidebar for each doc of that group
 * - provide next/previous navigation
 *
 * The sidebars can be generated from the filesystem, or explicitly defined here.
 *
 * Create as many sidebars as you want.
 */
module.exports = {
  tutorialSidebar: [
    {
      type: 'doc',
      id: 'intro',
      label: 'Introduction',
    },
    {
      type: 'doc',
      id: 'example',
      label: 'Example',
    },
    {
      type: 'category',
      label: 'Server',
      items: [
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
            'guides/openapi-documentation',
            'guides/openapi-to-typescript',
            'guides/asyncapi-to-typescript',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Client',
      items: [
        {
          type: 'category',
          label: 'Getting Started',
          items: [
            'client/getting-started/installation',
            'client/getting-started/quickstart',
          ],
        },
        {
          type: 'category',
          label: 'Core Concepts',
          items: [
            'client/core-concepts/basic-usage',
            'client/core-concepts/validation',
            'client/core-concepts/error-handling',
          ],
        },
        {
          type: 'category',
          label: 'Guides',
          items: [
            'client/guides/server-integration',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Kafka',
      items: [
        {
          type: 'category',
          label: 'Getting Started',
          items: [
            'kafka/getting-started/installation',
            'kafka/getting-started/quickstart',
          ],
        },
        {
          type: 'category',
          label: 'Core Concepts',
          items: [
            'kafka/core-concepts/topics-and-procedures',
            'kafka/core-concepts/consumers',
            'kafka/core-concepts/producers',
            'kafka/core-concepts/middleware',
            'kafka/core-concepts/custom-context',
            'kafka/core-concepts/error-handling',
            'kafka/core-concepts/combining-routers',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Workers (WarpStream)',
      items: [
        {
          type: 'category',
          label: 'Getting Started',
          items: [
            'workers-warpstream/getting-started/installation',
            'workers-warpstream/getting-started/quickstart',
          ],
        },
        {
          type: 'category',
          label: 'Core Concepts',
          items: [
            'workers-warpstream/core-concepts/routing-strategies',
            'workers-warpstream/core-concepts/job-client',
            'workers-warpstream/core-concepts/custom-context',
            'workers-warpstream/core-concepts/middleware',
            'workers-warpstream/core-concepts/error-handling',
          ],
        },
      ],
    },
  ],
};
