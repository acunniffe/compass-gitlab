const axios = require('axios');
const chalk = require('chalk')

// ---------------------- MODIFY HERE ----------------------
// Replace these with your GitLab instance URL and access token
const GITLAB_URL = 'TODO ADD HERE';
const ACCESS_TOKEN = 'TODO ADD HERE';
const USER_EMAIL = 'TODO ADD HERE';
const TOKEN = 'TODO ADD HERE'; // Create a token at https://id.atlassian.com/manage-profile/security/api-tokens
const TENANT_SUBDOMAIN = 'TODO ADD HERE'; // Add your subdomain here - find it from the url - e.g. https://<southwest>.atlassian.net
const CLOUD_ID = 'TODO ADD HERE'; // The UUID for your cloud site. This can be found in ARIs - look at the first uuid ari:cloud:compass:{cloud-uuid}

const ATLASSIAN_GRAPHQL_URL = `https://${TENANT_SUBDOMAIN}.atlassian.net/gateway/api/graphql`;

function makeGqlRequest(query) {
    const header = btoa(`${USER_EMAIL}:${TOKEN}`);
    return fetch(ATLASSIAN_GRAPHQL_URL, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${header}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(query),
    }).then((res) => res.json());
}


// This function looks for a component with a certain name, but if it can't find it, it will create a component.
// Alternatively you could manually create the component and then add it to each OpenAPI spec (and read the id from the spec)
async function getComponentAri(componentName) {
    console.log(`Searching for component with name ${componentName}`);
    const response = await makeGqlRequest({
        query: `
      query getComponent {
        compass @optIn(to: "compass-beta") {
          searchComponents(cloudId: "${CLOUD_ID}", query: {
            query: "${componentName}",
            first: 1
          }) {
            ... on CompassSearchComponentConnection {
              nodes {
                component {
                  id
                  name
                }
              }
            }
          }
        }
      }
      `,
    });
    const maybeResults = response?.data?.compass?.searchComponents?.nodes;
    if (!Array.isArray(maybeResults)) {
        console.error(`error fetching component: `, JSON.stringify(response));
        throw new Error('Error fetching component');
    }

    const maybeComponentAri = maybeResults.find(
        (r) => r.component?.name === componentName
    )?.component?.id;
    if (maybeComponentAri) {
        console.log(`found component ${maybeComponentAri}`);
        return maybeComponentAri;
    } else {
        const response = await makeGqlRequest({
            query: `
        mutation createComponent {
          compass @optIn(to: "compass-beta") {
            createComponent(cloudId: "${CLOUD_ID}", input: {name: "${componentName}", typeId: "SERVICE"}) {
              success
              componentDetails {
                id
              }
            }
          }
        }`,
        });
        const maybeAri =
            response?.data.compass?.createComponent?.componentDetails?.id;
        const isSuccess = !!response?.data.compass?.createComponent?.success;
        if (!isSuccess || !maybeAri) {
            console.error(`error creating component: `, JSON.stringify(response));
            throw new Error('Could not create component');
        }
        console.log(`successfully created component ${maybeAri}`);
        return maybeAri;
    }
}


async function listAllProjects() {
    let instanceProjects = 0
    let page = 1;
    const perPage = 100; // Maximum items per page as allowed by GitLab API
    while (true) {
        try {
            // Fetch projects for the current page
            const response = await axios.get(`${GITLAB_URL}/api/v4/projects`, {
                params: {
                    per_page: perPage,
                    page: page,
                    simple: true,
                },
                headers: {
                    'Private-Token': ACCESS_TOKEN,
                },
            });

            const projects = response.data;

            console.log(`Pulled projects ${instanceProjects} - ${instanceProjects+projects.length}`)
            // Inner loop: Iterate over projects on the current page
            for (const project of projects) {
                instanceProjects++
                // instanceProjects.push({
                //     name: project.name,
                //     web_url: project.web_url,
                //     tag_list: project.tag_list
                // readme_url: if I have time...
                // })
                //
                console.log(project)
                console.log(project.web_url)

            }

            // Check if we've reached the last page
            if (projects.length < perPage) {
                break; // Exit the pagination loop
            }

            page++; // Move to the next page
        } catch (error) {
            console.error(`Error fetching projects on page ${page}:`, error);
            break;
        }
    }
}

listAllProjects();
