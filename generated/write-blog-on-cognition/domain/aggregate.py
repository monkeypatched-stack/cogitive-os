from typing import Optional, List

class WriteBlogOnCognitionCreated:
    def __init__(self, write_blog_on_cognition_item_id: int):
        self.write_blog_on_cognition_item_id = write_blog_on_cognition_item_id

class WriteBlogOnCognitionUpdated:
    def __init__(self, write_blog_on_cognition_item_id: int):
        self.write_blog_on_cognition_item_id = write_blog_on_cognition_item_id

class WriteBlogOnCognitionDeleted:
    def __init__(self, write_blog_on_cognition_item_id: int):
        self.write_blog_on_cognition_item_id = write_blog_on_cognition_item_id

class WriteBlogOnCognitionAggregateRoot:
    def __init__(self, write_blog_on_cognition_item: Optional['WriteBlogOnCognitionItem'] = None):
        if write_blog_on_cognition_item is None:
            raise ValueError("WriteBlogOnCognition item cannot be None")
        self.write_blog_on_cognition_item = write_blog_on_cognition_item

    def update(self, title: Optional[str] = None, content: Optional[str] = None, status: Optional['Status'] = None, references: Optional[List['Reference']] = None):
        if self.write_blog_on_cognition_item is not None:
            self.write_blog_on_cognition_item.update(title=title, content=content, status=status, references=references)
            return WriteBlogOnCognitionUpdated(write_blog_on_cognition_item_id=self.write_blog_on_cognition_item.id)

    def delete(self):
        if self.write_blog_on_cognition_item is not None:
            self.write_blog_on_cognition_item = None
            return WriteBlogOnCognitionDeleted(write_blog_on_cognition_item_id=None)
```

This code defines the `WriteBlogOnCognitionAggregateRoot` class, which serves as the root aggregate for managing a `WriteBlogOnCognitionItem`. The class includes methods to update and delete the item, each of which emits the appropriate domain event.