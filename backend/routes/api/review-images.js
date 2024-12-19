
const express = require('express')
const bcrypt = require('bcryptjs');
const { setTokenCookie, requireAuth } = require('../../utils/auth');
const { User, SpotImage, ReviewImage, Spot, Review, Booking } = require('../../db/models');
const { check } = require('express-validator');
const { handleValidationErrors, handleValidationErrors403 } = require('../../utils/validation');
const router = express.Router();


// Delete a Review Image
router.delete('/:imageId', requireAuth, async (req, res, next) => {
    const { user } = req;

    const reviewImageFromId = await ReviewImage.findOne({
        where: {
            id: req.params.imageId
        },
    });

    if (!reviewImageFromId) {
        res.status(404);
        return res.json({
            "message": "Review Image couldn't be found"
          })
    }

    const review = await Review.findOne({
        where: {
            id: reviewImageFromId.reviewId
        }
    })

    if (reviewImageFromId.userId !== req.user.id) {
        return res.status(403).json({
            "message": "Successfully deleted"
        });
    }

    if (review.userId === user.id) {
        await reviewImageFromId.destroy();
        res.status(200).json({ "message": "Successfully deleted" })
         
    } 
})



module.exports = router;
