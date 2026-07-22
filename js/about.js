// About page: render the Markdown content below into #about-body, plus the
// shared footer year and back button.
//
// Edit ABOUT_CONTENT in Markdown — headings, links, lists, emphasis, etc. all
// work. It's rendered with marked and sanitized with DOMPurify, the same way
// post bodies are.

const ABOUT_CONTENT = `
This is placeholder text — replace it with your own writing. Say hello,
explain what **Sourfruits** is about, and tell people what they'll find here.

A good About page usually covers who you are, why you started the blog, and
what kinds of things you post. Keep it short and personal; you can always
expand it later.

Want to get in touch? Drop your email address, social links, or anything else
you'd like readers to know right here.

I like music, books, movies, learning, and I want to know what I like and why I like it. \n\nIt's too much work to obsessively collect and sort things on Spotify, Letterboxd, etc., so I made this website as my own visual archive of taste.

Hopefully this can become a way for me to:
* Catalogue my taste as it evolves
* Learn to articulate what matters to me

`;

initBackButton();

// Render the Markdown to HTML with marked, then sanitize before it hits the DOM.
document.getElementById("about-body").innerHTML =
  DOMPurify.sanitize(marked.parse(ABOUT_CONTENT));
