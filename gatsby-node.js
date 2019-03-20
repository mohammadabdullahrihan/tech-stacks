const path = require("path");
const { JSDOM } = require("jsdom");
const { createFilePath } = require("gatsby-source-filesystem");
const Xray = require('x-ray');

const { ApolloClient } = require('apollo-boost');
const { HttpLink } = require('apollo-link-http');
const { InMemoryCache } = require('apollo-cache-inmemory');
const fetch = require('node-fetch');
const gql = require('graphql-tag');

var x = Xray({
  filters: {
    trim: function (value) {
      return typeof value === 'string' ? value.trim() : value
    },
    clean: function (value) {
      return typeof value === 'string' ? value.replace(/\n/, ' ') : value
    },
    despace: function (value) {
      return typeof value === 'string' ? value.replace(/ /g, '') : value
    },
    removeText: function (value) {
      return typeof value === 'string' ? value.replace(/[a-zA-Z]+/, '') : value
    }
  }
}).concurrency(1);

// to support relative paths in sass files
exports.onCreateWebpackConfig = ({ actions }) => {
  actions.setWebpackConfig({
    resolve: {
      modules: [path.resolve(__dirname, "src"), "node_modules"],
    },
  })
}

function getApolloClient() {
  return new ApolloClient({
    link: new HttpLink({
      uri: 'https://api.github.com/graphql', fetch, headers: {
        Authorization: `bearer ${process.env.GITHUB_ACCESS_TOKEN}`
      }
    }),
    cache: new InMemoryCache()
  });
}

function getGitHubTool({ owner, name }) {
  return getApolloClient().query({
    variables: { owner, name },
    query: gql`
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    name
    nameWithOwner
    description
    descriptionHTML
    stargazers {
      totalCount
    }
    repositoryTopics(first: 3) {
      edges {
        node {
          topic {
            name
          }
        }
      }
    }
    forks {
      totalCount
    }
    updatedAt
    url
    homepageUrl
    languages(first: 1) {
      edges {
        node {
          name
          color
        }
      }
    }
  }
}
  `,
  })
    .then(({ data: { repository } }) => {
      return repository;
    }).catch((err) => {
      console.error(err);
      return;
    });;
}

function getGitHubUser(login) {
  return getApolloClient().query({
    variables: { login },
    query: gql`
query($login: String!) {
  user(login: $login) {
    login
    name
    avatarUrl
    url
  }
}
  `,
  })
    .then(({ data: { user } }) => {
      return user;
    }).catch((err) => {
      console.error(err);
      return;
    });
}

function getStackShareTool({ name, url, source }) {
  return x(url, 'body', {
    fullName: 'a[itemprop="name"]',
    layer: {
      name: 'li:nth-child(2)[itemprop="itemListElement"] a[data-track="service.breadcrumb_click"] span',
      url: 'li:nth-child(2)[itemprop="itemListElement"] a[data-track="service.breadcrumb_click"] @href',
    },
    group: {
      name: `a[itemprop="applicationSubCategory"]`,
      url: `a[itemprop="applicationSubCategory"] @href`,
    },
    category: {
      name: 'li:nth-child(3)[itemprop="itemListElement"] a[data-track="service.breadcrumb_click"] span',
      url: 'li:nth-child(3)[itemprop="itemListElement"] a[data-track="service.breadcrumb_click"] @href',
    },
    website: '#visit-website@href',
    tagline: "span[itemprop='alternativeHeadline']",
    description: "#service-description span",
    logo: "[itemprop='image']@src",
    features: ["#service-features li"],
    users: x("[data-track='tool_profile.clicked_companies_using_this']", [{
      name: "img@alt",
      url: "@href",
      logo: "img@src"
    }]),
    stackShareStats: x("#service-pills-nav li", [{
      name: "#tab-label | despace",
      value: "#tab-link | removeText | trim"
    }]),
    gitHubURL: "a[data-track='service.details.github_stats.click'] @href",
    gitHubStats: x("div.stackup-gh-count", [{
      name: "@data-hint | despace",
      value: ".gh-metric | trim",
      dateValue: ".gh-date | trim | clean"
    }])
  }).then((tool) => {
    return {
      name, url, source,
      ...tool
    };
  });
}

exports.onCreateNode = async ({ node,
  actions,
  getNode,
  loadNodeContent }) => {

  const { createNodeField } = actions

  if (node.internal.type !== `Mdx`) {
    return
  }

  // create a queryable sourceName field
  const parent = getNode(node.parent);
  if (parent.internal.type === "File") {
    createNodeField({
      name: `sourceName`,
      node,
      value: parent.sourceInstanceName
    });
  }

  const sourceInstanceName = parent.sourceInstanceName === `stacks` ? `` : parent.sourceInstanceName;

  // set the slug b/c outside /src/pages
  // https://gatsby-mdx.netlify.com/guides/programmatically-creating-pages
  const slugValue = createFilePath({ node, getNode });
  createNodeField({
    name: "slug",
    node,
    value: `${sourceInstanceName}${slugValue}`
  });

  // only process front matter for stacks
  if (parent.sourceInstanceName !== `stacks`) {
    return
  }

  const contributors = node.frontmatter.contributors;
  if (contributors) {
    const contributorsLoaded = await Promise.all(contributors.map(getGitHubUser)).filter(user => user);
    createNodeField({
      name: "contributors",
      node,
      value: contributorsLoaded
    });
  }

  // add a field for the list of tools used in the mdx
  const nodeContent = await loadNodeContent(node);
  const githubs = (nodeContent.match(/<GitHub [^>]+>/g) || []).map((toolTag) => {
    const nameWithOwner = (new JSDOM(toolTag)).window.document.querySelector("GitHub").attributes['name'].value;
    const [owner, name] = nameWithOwner.split('/');
    return { owner, name };
  });
  const githubsLoaded = await Promise.all(githubs.map((github) => {
    return getGitHubTool(github);
  })).filter(tool => tool);
  createNodeField({
    name: "gitHubTools",
    node,
    value: githubsLoaded
  });

  const stackshares = (nodeContent.match(/<StackShare [^>]+>/g) || []).map((toolTag) => {
    const name = (new JSDOM(toolTag)).window.document.querySelector("StackShare").attributes['name'].value;
    const url = `https://stackshare.io/${name}`;
    return { name, url };
  });
  // fetch the data from stackshare for each tool
  // filter out any tools that aren't found
  const stacksharesLoaded = await Promise.all(stackshares.map((stackshare) => {
    return getStackShareTool(stackshare);
  })).filter(tool => tool.fullName)

  createNodeField({
    name: "stackShareTools",
    node,
    value: stacksharesLoaded
  });

};

exports.createPages = ({ graphql, actions }) => {
  const { createPage } = actions;
  return new Promise((resolve, reject) => {
    resolve(
      graphql(
        `
          {
            allMdx(filter: { fields: { sourceName: { in: ["stacks", "docs"] } } }) {
              edges {
                node {
                  id
                  fields {
                    slug
                    sourceName
                  }
                }
              }
            }
          }
        `
      ).then(result => {
        if (result.errors) {
          console.error(result.errors);
          reject(result.errors);
        }
        result.data.allMdx.edges.forEach(({ node }) => {
          createPage({
            path: node.fields.slug,
            component: path.resolve(`./src/components/${node.fields.sourceName}-layout.js`),
            context: { id: node.id }
          });
        });
      })
    );
  });
};