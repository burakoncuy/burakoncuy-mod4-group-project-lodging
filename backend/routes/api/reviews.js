
const express = require('express')
const bcrypt = require('bcryptjs');
const { setTokenCookie, requireAuth } = require('../../utils/auth');
const { User, ReviewImage, SpotImage, Spot, Review } = require('../../db/models');
const { check } = require('express-validator');
const { handleValidationErrors } = require('../../utils/validation');
const router = express.Router();
router.use(express.json());


// Get all Reviews of the Current User
router.get('/current', requireAuth, async (req, res) => {
const { user } = req;
 const reviews = await Review.findAll({
        where: { userId: user.id },
        include: [
            {
                model: User,
                attributes: { exclude: ['username', 'email', 'hashedPassword', 'createdAt', 'updatedAt'] }
            },
            {
                model: Spot,
                attributes: { exclude: ['description', 'createdAt', 'updatedAt'] }
            },
            {
                model: ReviewImage,
                attributes: ['id', 'url']
            }
        ]
    });

 const userReviewsCopy = [];
    for (let review of reviews) {
        const reviewCopy = review.toJSON(); 
        const previewImage = await SpotImage.findOne({
            attributes: ['url'],
            where: {
                spotId: reviewCopy.Spot.id,
                preview: true
            }
        });
        if (previewImage) {
            reviewCopy.Spot.previewImage = previewImage.url;
        } else {
            reviewCopy.Spot.previewImage = null;
        }
        reviewCopy.ReviewImages = reviewCopy.ReviewImages || [];
        userReviewsCopy.push(reviewCopy);
    }

    return res.status(200).json({ Reviews: userReviewsCopy });
});


// Add an Image to a Review based on the Review's id
router.post('/:reviewId/images', requireAuth, async (req, res) => {
    const { url } = req.body;
    const { user } = req;

    const reviewForPic = await Review.findOne({
        where: {
            id: req.params.reviewId
        }
    });

    if (!reviewForPic) {
        res.status(404);
        return res.json({
            "message": "Review couldn't be found"
          })
    }
       if (reviewForPic.userId !== req.user.id) {
        return res.status(403).json({
            "message": "You are not authorized to add image to this review"
        });
    }

    const reviewImages = await ReviewImage.findAll({
        where: {
            reviewId: req.params.reviewId
        }
    })
    if (reviewImages.length >= 10) {
        res.status(403);
        return res.json({
            "message": "Maximum number of images for this resource was reached"
          })
    }

    const newReviewImage = await ReviewImage.create({ reviewId: req.params.reviewId, url })

    const newImageCopy = newReviewImage.toJSON();

    // delete newImageCopy.reviewId;
    // delete newImageCopy.updatedAt;
    // delete newImageCopy.createdAt;

    res.status(201);
    return res.json(newImageCopy)
})

const validateReview = [
    check('review')
      .exists({ checkFalsy: true })
      .withMessage('Review text is required'),
    check('stars')
      .exists({ checkFalsy: true })
      .isInt({min: 1, max: 5})
      .withMessage("Stars must be an integer from 1 to 5"),
    handleValidationErrors
  ];


// Edit a Review  
router.put('/:reviewId', requireAuth, validateReview, async (req, res) => {
    const { review, stars } = req.body;
    const { user } = req;

    const updatedReview = await Review.findOne({
        where: {
            id: req.params.reviewId
        }
    })

    if (!updatedReview) {
        res.status(404);
        return res.json({
            "message": "Review couldn't be found"
          })
    }
      if (updatedReview.userId !== req.user.id) {
        return res.status(403).json({
            "message": "You are not authorized to update this review"
        });
    }

    updatedReview.set({
        review,
        stars
     });

    await updatedReview.save();

    return res.json(updatedReview);

})


// Delete a Review
router.delete('/:reviewId', requireAuth, async (req, res, next) => {
    const reviewFromId = await Review.findOne({
        where: {
            id: req.params.reviewId
        },
    });
    if (!reviewFromId) {
        res.status(404);
        return res.json({
            "message": "Review couldn't be found"
          })
    }
    if (reviewFromId.userId !== req.user.id) {
        return res.status(403).json({
            "message": "You are not authorized to delete this review"
        });
    }
    await reviewFromId.destroy();
    return res.status(200).json({ "message": "Successfully deleted" })
})



module.exports = router;
