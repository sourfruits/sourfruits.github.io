// About page: render the Markdown content below into #about-body, plus the
// shared footer year and back button.
//
// Edit ABOUT_CONTENT in Markdown — headings, links, lists, emphasis, etc. all
// work. It's rendered with marked and sanitized with DOMPurify, the same way
// post bodies are.

const ABOUT_CONTENT = `
I want to visualize what music, books, movies, and other interests I gravitate towards across time and why. 

As it turns out, obsessively collecting and sorting across Google Docs, Spotify, and a hundred different apps and websites isn’t the most efficient way to do that, so I made this website as my own visual archive of taste. The hope is that this site becomes a way for me to:

1. Catalogue my interests as they evolve
2. Learn to articulate what matters to me

Check back to find out what I’m reading/watching/listening to, as well as my short-form *\[blurb\]* and occasional long-form *\[writeup\]* thoughts.
`;

// Render the Markdown to HTML with marked, then sanitize before it hits the DOM.
document.getElementById("about-body").innerHTML =
  DOMPurify.sanitize(marked.parse(ABOUT_CONTENT));
