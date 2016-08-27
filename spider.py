#!/usr/bin/env python
# -*- encoding: utf-8 -*-
# Created on 2016-07-10 15:07:57
# Project: ziroom

from pyspider.libs.base_handler import *
import re

class Handler(BaseHandler):
    crawl_config = {
    }

    @every(minutes= 24 * 60)
    def on_start(self):
        self.crawl('http://www.ziroom.com/z/nl/z2.html?p=1', callback=self.index_page)

    @config(age= 24 * 60 * 60)
    def index_page(self, response):
        for each in response.doc('a[href^="http"]').items():
            if re.match('http://www.ziroom.com/z/vr/\w+', each.attr.href):
                self.crawl(each.attr.href, callback=self.detail_page)
            if re.match('http://www.ziroom.com/z/nl/z2.html\?p=\w+', each.attr.href):
                self.crawl(each.attr.href, callback = self.next_page)
                print('index page:', each.attr.href)

    @config(age = 10 * 24 * 60 * 60)
    def next_page(self, response):
        for each in response.doc('a[href^="http"]').items():
            if re.match('http://www.ziroom.com/z/vr/\w+', each.attr.href):
                self.crawl(each.attr.href, callback=self.detail_page)
            if re.match('http://www.ziroom.com/z/nl/z2.html\?p=\w+', each.attr.href):
                self.crawl(each.attr.href, callback = self.next_page)
                print('next page:', each.attr.href)

    @config(priority=2)
    def detail_page(self, response):
        info = []
        for i in response.doc('.detail_room li').items():
            info.append(i.text())

        script = response.doc('script').text()
        house_address = re.search('(var house_address = )\"(.*)\"',script).groups()[1]
        steward_code = re.search('(var steward_code = )\"(.*)\"',script).groups()[1]
        house_code = re.search('(var house_code = )\"(.*)\"',script).groups()[1]

        return {
            "url": response.url,
            "title": response.doc('title').text(),
            "price": response.doc('.room_price').text(),
            "info": info,
            "address": house_address,
            "steward": steward_code,
            "house_code": house_code
        }
