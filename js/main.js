
	
/* --------------------------------------------------
	Initialization
-------------------------------------------------- */

    // Initialize all functions when the document is ready.
	$(document).ready(function(){
		initResize();
		initScroller();
		initAnimation();
		initowlCarousel();
		initContactAjax();
	});


/* --------------------------------------------------
	Scroll Nav
-------------------------------------------------- */

	function initScroller () {
		$('#scroll-page-content').localScroll({
           target:'#page-content'
        });
		$('#page-top').localScroll({
           target:'body'
        });
	}


/* --------------------------------------------------
	Animation
-------------------------------------------------- */

	function initAnimation () {
		new WOW().init();
	}


	
/* --------------------------------------------------
	Owl Carusel
-------------------------------------------------- */

	function initowlCarousel () {
		$("#owl-blog").owlCarousel({
			autoPlay: 3000,
			items : 3,
			itemsDesktop : [1199,3],
			itemsDesktopSmall : [979,2],
			itemsTablet : [768, 1],
			itemsMobile : [479, 1],
			navigation: false,
		});
		$("#owl-branding").owlCarousel({
			autoPlay: 3000,
			items : 5,
			itemsDesktop : [1199,4],
			itemsDesktopSmall : [979,3],
			itemsTablet : [768, 2],
			itemsMobile : [479, 2],
			navigation: false,
		});
	}

/* --------------------------------------------------
	Resize
-------------------------------------------------- */

	function initResize () {
		var header = $(".header-text");
		$(window).scroll(function() {
			var scroll = $(window).scrollTop();
			if ($(".index-page").length > 0) {
				if (scroll >= 270) {
					header.addClass("remove");
				} else {
					header.removeClass("remove");
				}
			}else{
				if (scroll >= 120) {
					header.addClass("remove");
				} else {
					header.removeClass("remove");
				}
			}
		});
		
		$(window).resize(function(){
			var width = (window.innerWidth > 0) ? window.innerWidth : screen.width;
			var footerHeight = $('#footer').outerHeight();
			if (width >= '768') { 
				$('#page-content').css({'marginBottom': footerHeight + 'px'});
			}else{
				$('#page-content').css({'marginBottom': '0px'});
			}
		});
		$(window).resize();
	}
	

/* --------------------------------------------------
	Typed js
-------------------------------------------------- */
document.addEventListener("DOMContentLoaded", function() {
	new Typed("#typed", {
	  strings: [
		"<b>Dreamer</b>",
		"<b>Designer</b>",
		"<b>Developer</b>",
		"<b>Dreamer</b>"
	  ],
	  typeSpeed: 100,
	  backSpeed: 0,
	  loop: true
	});
  });