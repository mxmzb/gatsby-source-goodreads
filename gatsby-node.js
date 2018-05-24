const axios = require(`axios`);
const crypto = require(`crypto`);
const parseString = require('pify')(require('xml2js').parseString);

function processBook (reviewElement) {
  const bookElement = reviewElement.book[0];

  let isbnValue = bookElement.isbn[0];
  let isbn13Value = bookElement.isbn13[0];
  if (isNaN(isbnValue)) {
    isbnValue = null;
  }
  if (isNaN(isbn13Value)) {
    isbn13Value = null;
  }
  const shelfNames = reviewElement.shelves[0].shelf.map(s => s.$.name);
  const review = {
    reviewID: reviewElement.id[0],
    rating: parseInt(reviewElement.rating[0]),
    votes: parseInt(reviewElement.votes[0]),
    spoilerFlag: reviewElement.spoiler_flag[0],
    spoilersState: reviewElement.spoilers_state[0],
    dateAdded: reviewElement.date_added[0]
      ? new Date(reviewElement.date_added[0]).toISOString()
      : null,
    dateUpdated: reviewElement.date_updated[0]
      ? new Date(reviewElement.date_updated[0]).toISOString()
      : null,
    startedAt: reviewElement.started_at[0]
      ? new Date(reviewElement.started_at[0]).toISOString()
      : null,
    readAt: reviewElement.read_at[0]
      ? new Date(reviewElement.read_at[0]).toISOString()
      : null
  };
  const book = {
    bookID: bookElement.id[0]._,
    isbn: isbnValue,
    isbn13: isbn13Value,
    textReviewsCount: bookElement.text_reviews_count[0]._,
    uri: bookElement.uri[0],
    link: bookElement.link[0],
    title: bookElement.title[0],
    titleWithoutSeries: bookElement.title_without_series[0],
    imageUrl: bookElement.image_url[0],
    smallImageUrl: bookElement.small_image_url[0],
    largeImageUrl: bookElement.large_image_url[0],
    description: bookElement.description[0],
    authors: bookElement.authors[0].author.map(authorElement => ({
      id: authorElement.id[0],
      name: authorElement.name[0],
      link: (authorElement.link[0] || '').trim(),
      imageUrl: (authorElement.image_url[0]._ || '').trim(),
      smallImageUrl: (authorElement.small_image_url[0]._ || '').trim(),
      average_rating: authorElement.average_rating[0],
      ratings_count: authorElement.ratings_count[0],
      text_reviews_count: authorElement.text_reviews_count[0]
    }))
  };
  return { shelfNames, book, review };
}
exports.sourceNodes = async (
  { boundActionCreators, reporter },
  { goodReadsUserId, userShelf = '', developerKey = '' }
) => {
  const { createNode } = boundActionCreators;
  if (!goodReadsUserId) {
    return;
  }

  // Do the initial fetch
  activity = reporter.activityTimer(`fetch goodreads data`);
  activity.start();
  let page = 1;
  try {
    while (1) {
      const shelfListXml = await axios.get(
        `https://www.goodreads.com/review/list/${goodReadsUserId}.xml?key=${developerKey}&v=2&page=${page}&shelf=${userShelf}`
      );

      if (shelfListXml.status !== 200) {
        reporter.panic(
          `gatsby-source-goodreads: Failed API call -  ${shelfListXml}`
        );
        return;
      }

      const shelfReviewId = `reviewList-${goodReadsUserId}`;

      const result = await parseString(shelfListXml.data);
      const end = parseInt(result.GoodreadsResponse.reviews[0].$.end);
      const total = parseInt(result.GoodreadsResponse.reviews[0].$.total);
      for (const element of result.GoodreadsResponse.reviews[0].review) {
        const { shelfNames, review, book } = processBook(element);
        createNode({
          id: review.reviewID,
          shelfNames,
          review,
          book,

          parent: null,
          children: [],
          internal: {
            type: `GoodreadsBook`,
            contentDigest: crypto
              .createHash(`md5`)
              .update(`book${goodReadsUserId}`)
              .digest(`hex`)
          }
        });
      }
      page++;
      if (end >= total) {
        break;
      }
    }
  } catch (err) {
    reporter.panic(
      `gatsby-source-goodreads: Failed to parse API call -  ${err}`
    );
  }
  activity.end();
};
