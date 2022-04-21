CREATE DATABASE IF NOT EXISTS `readitla_ril-tmp`;

USE readitla_ril-tmp;

-- table with a user's list
CREATE TABLE IF NOT EXISTS `list` (
  `user_id` int(10) unsigned NOT NULL,
  `item_id` int(10) unsigned NOT NULL,
  `resolved_id` int(10) unsigned NOT NULL,
  `given_url` text COLLATE utf8_unicode_ci NOT NULL,
  `title` varchar(75) COLLATE utf8_unicode_ci NOT NULL,
  `time_added` datetime NOT NULL,
  `time_updated` datetime NOT NULL,
  `time_read` datetime NOT NULL,
  `time_favorited` datetime NOT NULL,
  `api_id` mediumint(8) unsigned NOT NULL,
  `status` tinyint(3) unsigned NOT NULL,
  `favorite` tinyint(3) unsigned NOT NULL DEFAULT '0',
  `api_id_updated` mediumint(8) unsigned NOT NULL,
  PRIMARY KEY (`user_id`,`item_id`),
  KEY `item_id` (`item_id`),
  KEY `time_updated` (`time_updated`),
  KEY `time_added` (`time_added`),
  KEY `api_id` (`api_id`),
  KEY `resolved_id` (`resolved_id`),
  KEY `api_id_updated` (`api_id_updated`),
  KEY `user_id` (`user_id`,`status`,`item_id`),
  KEY `userStatusTime` (`user_id`,`status`,`time_updated`),
  KEY `userTimeAdded` (`user_id`,`status`,`time_added`),
  KEY `userTimeRead` (`user_id`,`status`,`time_read`),
  KEY `userTimeFavorited` (`user_id`,`favorite`,`time_favorited`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci ROW_FORMAT=COMPRESSED KEY_BLOCK_SIZE=8;

-- table with item tags
CREATE TABLE `item_tags` (
  `user_id` int(10) unsigned NOT NULL,
  `item_id` int(10) unsigned NOT NULL,
  `tag` varchar(25) CHARACTER SET utf8mb4 NOT NULL DEFAULT '',
  `entered_by` varchar(42) CHARACTER SET latin1 NOT NULL,
  `status` tinyint(3) unsigned NOT NULL DEFAULT '1',
  `time_added` datetime DEFAULT NULL,
  `api_id` mediumint(8) unsigned DEFAULT NULL,
  `time_updated` datetime DEFAULT NULL,
  `api_id_updated` mediumint(8) unsigned DEFAULT NULL,
  PRIMARY KEY (`user_id`,`item_id`,`tag`),
  KEY `tag` (`tag`(15),`item_id`),
  KEY `userStatusTime` (`user_id`,`status`,`time_updated`),
  KEY `idx_time_added` (`time_added`),
  KEY `idx_user_time` (`user_id`,`time_added`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci ROW_FORMAT=COMPRESSED KEY_BLOCK_SIZE=8;

CREATE TABLE `users_meta` (
  `user_id` int(10) unsigned NOT NULL,
  `property` tinyint(3) unsigned NOT NULL,
  `value` text NOT NULL,
  `time_updated` datetime NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`property`,`time_updated`),
  KEY `property` (`property`),
  KEY `time_updated` (`time_updated`),
  KEY `updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

CREATE TABLE `user_annotations` (
  `annotation_id` varchar(50) COLLATE utf8mb4_bin NOT NULL,
  `user_id` int(10) unsigned NOT NULL,
  `item_id` int(10) unsigned NOT NULL,
  `quote` mediumtext COLLATE utf8mb4_bin,
  `patch` mediumtext COLLATE utf8mb4_bin,
  `version` int(10) NOT NULL DEFAULT '1',
  `status` tinyint(3) unsigned NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`annotation_id`),
  KEY `user_item_idx` (`user_id`,`item_id`),
  KEY `item_idx` (`item_id`,`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `item_attribution` (
  `attribution_id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `item_id` int(10) unsigned NOT NULL,
  `attribution_type_id` int(10) unsigned NOT NULL,
  `profile_name` varchar(50) COLLATE utf8mb4_bin DEFAULT NULL,
  `profile_contact` varchar(100) COLLATE utf8mb4_bin DEFAULT NULL,
  `profile_image` text COLLATE utf8mb4_bin,
  `source_id` varchar(100) COLLATE utf8mb4_bin DEFAULT NULL,
  `attribution_time` int(11) DEFAULT NULL,
  `data` mediumtext COLLATE utf8mb4_bin,
  `api_id` mediumint(8) unsigned DEFAULT NULL,
  `status` tinyint(3) unsigned NOT NULL DEFAULT '1',
  `time_added` int(11) DEFAULT NULL,
  PRIMARY KEY (`attribution_id`),
  KEY `user_id` (`user_id`,`item_id`),
  KEY `attribution_source_idx` (`attribution_type_id`,`source_id`)
) ENGINE=InnoDB AUTO_INCREMENT=8937791 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `items_scroll` (
  `user_id` int(10) unsigned NOT NULL,
  `item_id` int(10) unsigned NOT NULL,
  `view` tinyint(3) unsigned NOT NULL,
  `section` tinyint(4) NOT NULL,
  `page` tinyint(3) unsigned NOT NULL,
  `node_index` smallint(5) unsigned NOT NULL,
  `scroll_percent` tinyint(3) unsigned NOT NULL,
  `time_updated` datetime NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`item_id`,`view`),
  KEY `time_updated` (`time_updated`),
  KEY `updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- Suggested Tags Tables
CREATE TABLE `suggested_tags_user_grouping_tags` (
    user_id        int unsigned            not null,
    grouping_id    bigint unsigned         not null,
    tag            varchar(25)             not null,
    weighted_count decimal(11, 4) unsigned not null,
    count          int unsigned            not null,
    primary key (user_id, grouping_id, tag)
) COLLATE=utf8_unicode_ci;

CREATE INDEX `user_tag_idx` ON suggested_tags_user_grouping_tags (user_id, tag);

CREATE TABLE `suggested_tags_user_groupings`
(
    user_id        int unsigned            not null,
    grouping_id    bigint unsigned         not null,
    weighted_count decimal(11, 4) unsigned not null,
    count          int unsigned            not null,
    primary key (user_id, grouping_id)
) COLLATE = utf8_unicode_ci;

CREATE DATABASE IF NOT EXISTS `readitla_b`;

USE readitla_b;

-- NOTE: This is a subset of fields in the actual table, for test purposes
CREATE TABLE `items_extended` (
  `extended_item_id` int(10) unsigned NOT NULL,
  `image` tinyint(1) NOT NULL,
  `video` tinyint(1) NOT NULL,
  `is_article` tinyint(1) NOT NULL,
  PRIMARY KEY (`extended_item_id`),
  KEY `is_article` (`is_article`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 ROW_FORMAT=COMPRESSED KEY_BLOCK_SIZE=8;

CREATE TABLE `item_grouping`(
    resolved_id  int unsigned             not null,
    grouping_id  bigint unsigned          not null,
    source_score decimal(21, 20) unsigned not null,
    primary key (resolved_id, grouping_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE INDEX `grouping_idx` ON item_grouping (grouping_id);
