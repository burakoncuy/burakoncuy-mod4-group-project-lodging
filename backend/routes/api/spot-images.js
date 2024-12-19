
const express = require('express');
const { setTokenCookie, requireAuth } = require('../../utils/auth');
const { SpotImage, Spot } = require('../../db/models');
const router = express.Router();


// Delete a Spot Image
router.delete('/:imageId', requireAuth, async (req, res, next) => {
    const { user } = req;
    const spotImageFromId = await SpotImage.findOne({
        where: {
            id: req.params.imageId
        },
    });

    if (!spotImageFromId) {
        return res.status(404).json({
            "message": "Spot Image couldn't be found"
          })
    }

    const spot = await Spot.findOne({
        where: {
            id: spotImageFromId.spotId
        }
    })

    if (spot.ownerId === user.id) {
        await spotImageFromId.destroy();
        return res.status(200).json({ "message": "Successfully deleted" })
    } else {
        return res.status(403).json({
            "message": "Forbidden"
          })
    }
})



module.exports = router;
