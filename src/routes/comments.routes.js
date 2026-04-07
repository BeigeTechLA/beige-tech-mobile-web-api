const router = require('express').Router();
const commentsController = require('../controllers/comments.controller');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, commentsController.listComments);
router.post('/', authenticate, commentsController.addComment);
router.post('/:commentId/reply', authenticate, commentsController.replyToComment);
router.delete('/:commentId', authenticate, commentsController.deleteComment);

module.exports = router;
