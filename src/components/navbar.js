import React, { useState } from "react"
import { useStaticQuery, graphql, Link } from "gatsby"
import Img from "gatsby-image"
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

function Navbar() {
  const data = useStaticQuery(navbarQuery);
  const Tags = data.allMdx.edges.map(edge => <a className="tag is-medium" key={edge.node.id} href={`/${edge.node.parent.name}`}>{edge.node.frontmatter.title}</a>);
  const [dropdown, setDropdown] = useState('');
  const [burger, setBurger] = useState('');
  return (
    <div className="nav navbar is-fixed-top has-shadow has-background-white">
      <div className="container">
        <div className="navbar-brand">
          <Link className="navbar-item" to="/">
            <Img fixed={data.brandImage.childImageSharp.fixed} />
            <div className="is-size-4 has-margin-left-10">
              {data.site.siteMetadata.title}
            </div>
          </Link>
          <div className={`span navbar-burger burger ${burger}`} data-target="navbarMenuHeroA" onClick={() => setBurger(burger === 'is-active' ? '' : 'is-active')}>
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className={`navbar-menu ${burger}`} id="#navbarMenuHeroA">
          <div className="navbar-end">
            {/* <div className={`navbar-item has-dropdown ${dropdown}`}
              onClick={() => setDropdown(dropdown === 'is-active' ? '' : 'is-active')}>
              <div className="navbar-link"><span role="img" aria-label="fire">🔥</span> &nbsp; Stacks</div>
              <div className="navbar-dropdown" style={{ width: "300px" }}>
                <div className="navbar-item">
                  <div className="tags">
                    {Tags}
                  </div>
                </div>
              </div>
            </div> */}
            <a className="navbar-item" href="/about">About</a>
            <a className="navbar-item" href="/docs">Docs</a>
            <a className="navbar-item" href={data.site.siteMetadata.repository}>
              <FontAwesomeIcon icon={["fab", "github"]} />
              <span>&nbsp;&nbsp;GitHub</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

const navbarQuery = graphql`
query {
  brandImage: file(relativePath: { eq: "awesome-logo.png" }) {
    childImageSharp {
      fixed(height: 32) {
        ...GatsbyImageSharpFixed
      }
    }
  }
  site {
    siteMetadata {
      title
      repository
    }
  }
  allMdx(
    sort: { order: DESC, fields: [frontmatter___date] },
    filter: { fields: { sourceName: { eq: "stacks" } } }) {
    edges {
      node {
        ...MdxFields
      }
    }
  }
}`;

export default Navbar;