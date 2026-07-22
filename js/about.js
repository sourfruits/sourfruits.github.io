// About page: render the Markdown content below into #about-body, plus the
// shared footer year and back button.
//
// Edit ABOUT_CONTENT in Markdown — headings, links, lists, emphasis, etc. all
// work. It's rendered with marked and sanitized with DOMPurify, the same way
// post bodies are.

const ABOUT_CONTENT = `
I like music, books, movies, learning, and I want to see what I like and why I like it.

I’ve been obsessively collecting and sorting my interests across Google Docs, Spotify, and numerous other apps for far too long, so I made this website as my own visual archive of taste. Hopefully, this can become a way for me to:
* Catalogue my taste as it evolves  
* Learn to articulate what matters to me

Check back to find out what I’m reading/watching/listening to, as well as my short-form *\[tag:blurb\]* and occasional long-form *\[tag:writeup\]* thoughts.
`;

initBackButton();

// Render the Markdown to HTML with marked, then sanitize before it hits the DOM.
document.getElementById("about-body").innerHTML =
  DOMPurify.sanitize(marked.parse(ABOUT_CONTENT));
