const path = require("path");
const cheerio = require("cheerio");
const slugify = require('@sindresorhus/slugify');
const remark = require('remark');
const html = require('remark-html');

const stackshare = require("../../src/utils/stackshare");
const github = require("../../src/utils/github");

const customReplacements = [
  [".", ""]
]

exports.onCreateNode = async ({ node,
  actions,
  getNode,
  loadNodeContent }) => {

  const { createNodeField } = actions

  if (node.internal.type !== `MarkdownRemark`) {
    return
  }

  const parent = getNode(node.parent);
  if (parent.internal.type === "File") {
    createNodeField({
      name: `sourceName`,
      node,
      value: parent.sourceInstanceName
    });
  }

  if (parent.sourceInstanceName !== `readme-stacks`) {
    return
  }

  // add a field for the list of tools used in the mdx
  const nodeContent = await loadNodeContent(node);
  const nodeContentHtml = await remark().use(html).process(nodeContent);

  const $ = cheerio.load(nodeContentHtml.contents);

  const categories = $(`h2`).map((_, category) => {
    return {
      name: $(category).text(),
      path: slugify($(category).text(), { customReplacements }),
      stacks: $(category).nextUntil(`h2`, `h3`).map((_, stack) => {
        return {
          name: $(stack).find("a").text(),
          path: slugify($(stack).find("a").text(), { customReplacements }),
          url: $(stack).find("a").attr("href"),
          description: $(stack).next("p").text(),
          tools: $(stack).nextUntil(`h3`, `ul`).find(`li`).map((_, tool) => {
            const toolObj = {};
            $(tool).find("a").each((_, link) => {
              if ($(link).attr("href").match(/stackshare.io\//)) {
                toolObj.stackShareUrl = $(link).attr("href");
              } else if ($(link).attr("href").match(/github.com\//)) {
                toolObj.gitHubUrl = $(link).attr("href");
              } else if ($(link).text().match(/[\w\d_ -]/)) {
                toolObj.name = $(link).text();
                toolObj.url = $(link).attr("href");
              }
            });
            toolObj.description = $(tool).clone().children().remove().end().contents().text().replace(/ - /g, "").trim();
            return toolObj;
          }).get()
        }
      }).get()
    }
  }).get()

  // get the stacks then get the tools
  await Promise.all(categories.map(category => {

    return category.stacks.map(stack => {

      return Promise.all(stack.tools.map(async tool => {
        if (tool.gitHubUrl) {
          const [owner, name] = tool.gitHubUrl.replace(/http[s]+:\/\/github\.com\//, '').split(`/`);
          try {
            tool.gitHubData = await github.getGitHubTool({ owner, name })
          } catch (e) {
            console.warn(e);
          }
        }
        if (tool.stackShareUrl) {
          const url = tool.stackShareUrl
          const name = url.replace(/http[s]+:\/\/stackshare\.io\//, '')
          try {
            tool.stackShareData = await stackshare.getStackShareTool({ name, url });
          } catch (e) {
            console.warn(e);
          }
        }
      }));

    });

  }));

  createNodeField({
    name: "categories",
    node,
    value: categories
  });

};

exports.createPages = ({ graphql, actions }) => {
  const { createPage } = actions;
  return new Promise((resolve, reject) => {
    resolve(
      graphql(
        `
          {
            allMarkdownRemark(filter: { fields: { sourceName: { eq: "readme-stacks" } } }) {
              edges {
                node {
                  id
                  fields {
                    categories {
                      stacks {
                        name
                        path
                      }
                    }
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
          return
        }
        // there will just be one edge for the readme
        result.data.allMarkdownRemark.edges.forEach(({ node }) => {
          node.fields.categories.forEach(category => {
            category.stacks.forEach(stack => {
              createPage({
                path: stack.path,
                component: path.resolve(`./src/components/pages/readme-stacks-page.js`),
                context: { id: node.id, stackName: stack.name }
              });
            });
          });
        });
      })
    );
  });
};